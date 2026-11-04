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

/** The LLM's answer to `messages` under `instructions`. */
export async function complete(
	connection: LlmConnection,
	instructions: string,
	messages: Message[],
	options: CallOptions,
): Promise<AssistantMessage> {
	const context: Context = { systemPrompt: instructions, messages };
	let message: AssistantMessage;
	try {
		message = await piModels().completeSimple(modelOf(connection), context, {
			apiKey: apiKeyOf(connection),
			temperature: options.temperature,
			maxTokens: options.maxTokens,
			reasoning: thinkingLevelOf(connection),
			signal: options.signal,
			maxRetries: 0,
		});
	} catch (error) {
		if (options.signal?.aborted) throw error;
		throw llmFailure(error);
	}
	if (message.stopReason === "aborted") throw options.signal?.reason ?? new Error("中断されました");
	const failed = assistantError(message);
	if (failed) throw failed;
	return message;
}

/** One answer from the conversation's LLM to `prompt`. */
export async function generateOnce(
	connection: LlmConnection,
	instructions: string,
	prompt: string,
	options: CallOptions,
): Promise<string> {
	const message = await complete(
		connection,
		instructions,
		[{ role: "user", content: prompt, timestamp: Date.now() }],
		options,
	);
	const text = replyText(message);
	if (!text) throw emptyReplyError();
	return text;
}
