// One answer from the conversation's LLM, outside any conversation: no memory, no tools. Also the
// error any call to it ends with.

import type { AssistantMessage, Context, Message } from "@earendil-works/pi-ai";
import { ConflictError, isApiError, messageOf } from "../lib/errors";
import { ThinkFilter } from "../lib/text";
import { emptyReplyError } from "./models";
import { apiKeyOf, type LlmConnection, modelOf, piModels, thinkingLevelOf } from "./providers";

export interface CallOptions {
	temperature: number;
	/** Undefined: the model's default. */
	maxTokens?: number;
	signal?: AbortSignal;
}

/** One connection, or the connections to try in order (the main model and its fallbacks). */
export type Connections = LlmConnection | LlmConnection[];

/** Whatever the call failed with, in words the screen can show. */
export function llmFailure(error: unknown): Error {
	if (isApiError(error)) return error;
	const cause = (error as { cause?: unknown })?.cause;
	const detail = cause ? `${messageOf(error)}: ${messageOf(cause)}` : messageOf(error);
	return new ConflictError(`LLM API エラー: ${detail}`);
}

/** The reply's error, when the call did not end well. */
export function assistantError(message: AssistantMessage): Error | null {
	if (message.stopReason !== "error") return null;
	return new ConflictError(`LLM API エラー: ${message.errorMessage || "不明なエラー"}`);
}

/** The text of a reply, without its thinking. */
export function replyText(message: AssistantMessage): string {
	const raw = message.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("");
	const filter = new ThinkFilter();
	return (filter.feed(raw) + filter.flush()).trim();
}

/** One call to one model; it throws whatever the call failed with. */
async function completeWith(
	connection: LlmConnection,
	context: Context,
	options: CallOptions,
): Promise<AssistantMessage> {
	const message = await piModels().completeSimple(modelOf(connection), context, {
		apiKey: apiKeyOf(connection),
		temperature: options.temperature,
		maxTokens: options.maxTokens,
		reasoning: thinkingLevelOf(connection),
		signal: options.signal,
		maxRetries: 0,
	});
	if (message.stopReason === "aborted") throw options.signal?.reason ?? new Error("中断されました");
	const failed = assistantError(message);
	if (failed) throw failed;
	return message;
}

/** The LLM's answer to `messages` under `instructions`, from the first connection that answers. */
export async function complete(
	connections: Connections,
	instructions: string,
	messages: Message[],
	options: CallOptions,
): Promise<AssistantMessage> {
	const context: Context = { systemPrompt: instructions, messages };
	const tries = [connections].flat();
	let last: unknown = new Error("モデルがありません");
	for (const connection of tries) {
		try {
			return await completeWith(connection, context, options);
		} catch (error) {
			if (options.signal?.aborted) throw error;
			last = error;
		}
	}
	throw llmFailure(last);
}

/** One answer from the conversation's LLM to `prompt`. */
export async function generateOnce(
	connections: Connections,
	instructions: string,
	prompt: string,
	options: CallOptions,
): Promise<string> {
	const message = await complete(
		connections,
		instructions,
		[{ role: "user", content: prompt, timestamp: Date.now() }],
		options,
	);
	const text = replyText(message);
	if (!text) throw emptyReplyError();
	return text;
}
