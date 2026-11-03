// The LLM Stagehand reads pages with: the conversation's own model through pi, so the browser
// works with every provider of the app, the subscriptions included. Stagehand asks for JSON that
// matches a zod schema (act, extract, observe); the model is shown the schema as JSON Schema and
// its answer is checked against the zod schema, with one more try when it does not match.

import {
	type ChatMessage,
	type ChatMessageImageContent,
	type CreateChatCompletionOptions,
	LLMClient,
	type LLMUsage,
	type StagehandZodSchema,
	toJsonSchema,
} from "@browserbasehq/stagehand";
import type { AssistantMessage, ImageContent, Message, TextContent } from "@earendil-works/pi-ai";
import { ConflictError, messageOf } from "../../lib/errors";
import { complete, replyText } from "../llm";
import { type LlmConnection, modelOf } from "../providers";

const TEMPERATURE = 0.1;
const ATTEMPTS = 2;

type Part = TextContent | ImageContent;

function imageOf(url: string): ImageContent | null {
	const match = /^data:(image\/[\w.+-]+);base64,/.exec(url);
	return match?.[1]
		? { type: "image", mimeType: match[1], data: url.slice(match[0].length) }
		: null;
}

function partsOf(content: ChatMessage["content"], vision: boolean): Part[] {
	if (typeof content === "string") return [{ type: "text", text: content }];
	return content.flatMap((part): Part[] => {
		const c = part as ChatMessageImageContent;
		const image =
			(c.image_url && imageOf(c.image_url.url)) ||
			(c.source?.type === "base64"
				? { type: "image" as const, mimeType: c.source.media_type, data: c.source.data }
				: null);
		if (image) return vision ? [image] : [{ type: "text", text: "[image]" }];
		return c.text ? [{ type: "text", text: c.text }] : [];
	});
}

const textOf = (parts: Part[]) =>
	parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n");

/** The JSON object in a reply, even when it comes in a code fence or after some words. */
function jsonOf(text: string): unknown {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start < 0 || end < start) throw new Error("the answer has no JSON object");
	return JSON.parse(text.slice(start, end + 1));
}

interface SafeParse {
	safeParse(value: unknown): { success: boolean; data?: unknown; error?: unknown };
}

const usageOf = (message: AssistantMessage): LLMUsage => ({
	prompt_tokens: message.usage.input,
	completion_tokens: message.usage.output,
	total_tokens: message.usage.totalTokens,
	reasoning_tokens: message.usage.reasoning,
	cached_input_tokens: message.usage.cacheRead,
});

export class StagehandLlm extends LLMClient {
	type = "nextroom";
	/** The tool call being run, so that stopping the reply stops its LLM calls too. */
	signal: AbortSignal | undefined;

	constructor(private readonly connection: LlmConnection) {
		super(connection.model as never);
		this.hasVision = false;
		try {
			this.hasVision = modelOf(connection).input.includes("image");
		} catch {}
	}

	async createChatCompletion<T>({ options }: CreateChatCompletionOptions): Promise<T> {
		const system: string[] = [];
		const messages: Message[] = [];
		for (const message of options.messages) {
			const parts = partsOf(message.content, this.hasVision);
			if (message.role === "system") system.push(textOf(parts));
			else
				messages.push({
					role: "user",
					content: message.role === "assistant" ? textOf(parts) : parts,
					timestamp: Date.now(),
				});
		}
		if (options.image) {
			const image = `data:image/png;base64,${options.image.buffer.toString("base64")}`;
			const parts = partsOf(
				[
					{ type: "image_url", image_url: { url: image } },
					...(options.image.description ? [{ type: "text", text: options.image.description }] : []),
				],
				this.hasVision,
			);
			messages.push({ role: "user", content: parts, timestamp: Date.now() });
		}
		const call = {
			temperature: options.temperature ?? TEMPERATURE,
			maxTokens: options.maxOutputTokens,
			signal: this.signal,
		};
		const model = options.response_model;
		if (!model) {
			const reply = await complete(this.connection, system.join("\n\n"), messages, call);
			return this.response(reply) as T;
		}
		const instructions = [
			...system,
			`Answer with only a JSON object that matches this JSON Schema, with no other text and no code fence:\n${JSON.stringify(toJsonSchema(model.schema))}`,
		].join("\n\n");
		let problem = "";
		for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
			const reply = await complete(this.connection, instructions, messages, call);
			const text = replyText(reply);
			try {
				const parsed = (model.schema as StagehandZodSchema & SafeParse).safeParse(jsonOf(text));
				if (parsed.success) return { data: parsed.data, usage: usageOf(reply) } as T;
				problem = messageOf(parsed.error);
			} catch (error) {
				problem = messageOf(error);
			}
			messages.push(reply, {
				role: "user",
				content: `That answer does not match the schema (${problem}). Answer again with only the JSON object.`,
				timestamp: Date.now(),
			});
		}
		throw new ConflictError(
			`LLM の返答を ${model.name} の JSON として読めませんでした: ${problem}`,
		);
	}

	/** A reply without a schema, in the shape of OpenAI's chat completion that Stagehand reads. */
	private response(reply: AssistantMessage) {
		return {
			id: reply.responseId ?? `chatcmpl_${Date.now()}`,
			object: "chat.completion",
			created: Math.floor(Date.now() / 1000),
			model: this.connection.model,
			choices: [
				{
					index: 0,
					message: { role: "assistant", content: replyText(reply) || null, tool_calls: [] },
					finish_reason: reply.stopReason === "length" ? "length" : "stop",
				},
			],
			usage: usageOf(reply),
		};
	}
}
