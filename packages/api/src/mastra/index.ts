import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { ConflictError, messageOf } from "../lib/errors";
import { ThinkFilter } from "../lib/text";
import { characterAgent } from "./agents/character-agent";
import type { CharacterContext } from "./context";
import { memoryStore } from "./memory";
import { emptyReplyError, llmErrorMessage, unreachable } from "./model";
import { effortOptions, type LlmConnection, languageModel } from "./providers";
import { offeredChoices } from "./tools/ask-user";

export { irodoriVoice } from "./voice";

/** The agents, as Mastra (and Mastra Studio) looks for them. Its storage lives in the
 *  data folder, which is known only once configure() runs; attachStorage() attaches it. */
export const mastra = new Mastra({
	agents: { characterAgent },
	logger: false,
});

export function attachStorage(): void {
	mastra.setStorage(memoryStore());
}

interface CallOptions {
	temperature: number;
	/** Undefined: the model's default. */
	maxTokens?: number;
	/** Undefined: the model's default. */
	effort?: string;
	signal?: AbortSignal;
}

/** Whatever the call failed with, in words the screen can show. */
function failed(error: unknown): Error {
	if (error instanceof ConflictError) return error;
	const call = error as {
		statusCode?: number;
		responseBody?: string;
		url?: string;
		cause?: unknown;
	};
	if (call?.statusCode)
		return new ConflictError(llmErrorMessage(call.statusCode, call.responseBody ?? ""));
	if (call?.url) return unreachable(call.url, error);
	return new ConflictError(`LLM API エラー: ${messageOf(error)}`);
}

/** A RequestContext holding every value of `context`. */
function requestContextOf<T extends object>(context: T): RequestContext<T> {
	const requestContext = new RequestContext<T>();
	for (const [key, value] of Object.entries(context)) {
		requestContext.set(key as never, value as never);
	}
	return requestContext;
}

const modelSettings = (options: CallOptions) => ({
	temperature: options.temperature,
	maxOutputTokens: options.maxTokens,
	maxRetries: 0,
});

/** One answer from the conversation's LLM to `prompt`, outside any conversation: no memory,
 *  no tools. */
export async function generateOnce(
	connection: LlmConnection,
	instructions: string,
	prompt: string,
	options: CallOptions,
): Promise<string> {
	const agent = new Agent({
		id: "one-off",
		name: "One-off",
		instructions,
		model: languageModel(connection),
	});
	try {
		const output = await agent.generate(prompt, {
			abortSignal: options.signal,
			modelSettings: modelSettings(options),
			providerOptions: effortOptions(connection, options.effort),
		});
		const filter = new ThinkFilter();
		const text = (filter.feed(output.text ?? "") + filter.flush()).trim();
		if (!text) throw emptyReplyError();
		return text;
	} catch (error) {
		throw failed(error);
	}
}

/** Tool calls the agent may chain in one reply before it has to answer. */
const MAX_STEPS = 12;

type DataChunk = { type: string; data?: Record<string, unknown> };

/** A workspace tool's live output (`data-sandbox-*`), at the top level or inside tool-output. */
function sandboxData(chunk: { type: string; payload?: unknown }): DataChunk | null {
	if (chunk.type.startsWith("data-sandbox-")) return chunk as DataChunk;
	if (chunk.type === "tool-output") {
		const output = (chunk.payload as { output?: DataChunk } | undefined)?.output;
		if (output?.type?.startsWith("data-sandbox-")) return output;
	}
	return null;
}

/** Yielded by streamReply where a run of text ends (e.g. before a tool call): whatever was
 *  said so far is complete and should be spoken now, not when the next text arrives. */
export const TEXT_BREAK = Symbol("text-break");

/** The character's reply text pieces as they arrive. Its tool calls (and their output) go to
 *  the context's reporter; the conversation is remembered under `resourceId`. */
export async function* streamReply(
	context: CharacterContext,
	text: string,
	resourceId: string,
	options: CallOptions,
): AsyncGenerator<string | typeof TEXT_BREAK> {
	const requestContext = requestContextOf(context);
	const { reporter } = context;
	try {
		const output = await mastra.getAgent("characterAgent").stream(text, {
			requestContext,
			abortSignal: options.signal,
			modelSettings: modelSettings(options),
			providerOptions: effortOptions(context.connection, options.effort),
			memory: { thread: context.threadId, resource: resourceId },
			maxSteps: MAX_STEPS,
			stopWhen: offeredChoices(reporter),
		});
		for await (const chunk of output.fullStream) {
			const data = sandboxData(chunk);
			if (data) {
				const id = String(data.data?.toolCallId ?? "");
				if (data.type === "data-sandbox-exit") {
					const code = data.data?.exitCode;
					if (typeof code === "number" && code !== 0) reporter.append(id, `\n[終了コード ${code}]`);
				} else {
					reporter.append(id, String(data.data?.output ?? ""));
				}
				continue;
			}
			switch (chunk.type) {
				case "text-delta":
					if (chunk.payload.text) yield chunk.payload.text;
					break;
				case "text-end":
				case "tool-call-input-streaming-start":
					yield TEXT_BREAK;
					break;
				case "tool-call":
					yield TEXT_BREAK;
					reporter.start(chunk.payload.toolCallId, chunk.payload.toolName, chunk.payload.args);
					break;
				case "tool-result":
					reporter.finish(
						chunk.payload.toolCallId,
						chunk.payload.isError ? "error" : "done",
						chunk.payload.result,
					);
					break;
				case "tool-error":
					reporter.finish(chunk.payload.toolCallId, "error", chunk.payload.error);
					break;
				case "error":
					throw chunk.payload.error;
			}
		}
		if (output.error) throw output.error;
	} catch (error) {
		if (options.signal?.aborted) return;
		throw failed(error);
	} finally {
		reporter.close();
	}
}
