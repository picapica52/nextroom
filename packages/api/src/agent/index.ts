// The character agent, on pi (@earendil-works/pi-agent-core): the system prompt with the persona,
// the character's notes and the summary of older talks, then the conversation since, then the
// user's message with what is said after the conversation (the time, the relationship). Its tool
// calls go to the context's reporter, and the messages of the reply are handed back to be kept.

import {
	type AgentEvent,
	type AgentMessage,
	type AgentTool,
	agentLoop,
} from "@earendil-works/pi-agent-core";
import { createInitialSystemMessage, type Message, type UserMessage } from "@earendil-works/pi-ai";
import type { CharacterContext } from "./context";
import { assistantError, type CallOptions, llmFailure } from "./llm";
import { historyForModel, memoryReady, readNotes } from "./memory";
import { NOTES_TEMPLATE } from "./memory/notes";
import { toolGuide } from "./prompts";
import { modelOf, streamFnOf, thinkingLevelOf } from "./providers";
import { type ToolSet, toAgentTool } from "./tool";
import { askUserTools, offeredChoices } from "./tools/ask-user";
import { browserTools } from "./tools/browser";
import { composioTools } from "./tools/composio";
import { findTopicTools } from "./tools/find-topic";
import { imageGenTools } from "./tools/image-gen";
import { memoryTools } from "./tools/memory";
import { sandboxTools } from "./tools/sandbox";
import { webSearchTools } from "./tools/web-search";

export { generateOnce } from "./llm";
export { irodoriVoice } from "./voice";

/** Tool calls the agent may chain in one reply before it has to answer. */
const MAX_STEPS = 12;

/** Yielded by streamReply where a run of text ends (e.g. before a tool call): whatever was
 *  said so far is complete and should be spoken now, not when the next text arrives. */
export const TEXT_BREAK = Symbol("text-break");

/** Every tool the settings turn on. */
async function toolsOf(context: CharacterContext): Promise<ToolSet> {
	const { settings, connection } = context;
	return {
		...memoryTools(),
		...webSearchTools(settings),
		...findTopicTools(settings),
		...browserTools(settings, connection),
		...sandboxTools(settings),
		...imageGenTools(settings),
		...askUserTools(settings),
		...(await composioTools(settings)),
	};
}

const section = (title: string, body: string) => (body.trim() ? `# ${title}\n${body.trim()}` : "");

/** The system prompt: the instructions and tools, the persona, then what the character holds
 *  in memory (which changes less often the earlier it comes, for the prompt cache). */
function systemPrompt(context: CharacterContext, summary: string): string {
	const notes = readNotes(context.characterId);
	return [
		context.system,
		toolGuide(context.settings),
		...context.beforeHistory,
		section(
			"Your notes (MEMORY.md)",
			notes ||
				`(Nothing yet. Start your notes with update_memory when there is something to keep, under these headings:)\n${NOTES_TEMPLATE}`,
		),
		section("What happened in your earlier conversations", summary),
	]
		.filter(Boolean)
		.join("\n\n");
}

/** The user's message as the model is given it: with what comes after the conversation. */
function withPostHistory(message: UserMessage, postHistory: string): UserMessage {
	if (!postHistory) return message;
	const note = { type: "text" as const, text: `[Not said by the user]\n${postHistory}` };
	const content =
		typeof message.content === "string"
			? [{ type: "text" as const, text: message.content }, note]
			: [...message.content, note];
	return { ...message, content };
}

const isMessage = (m: AgentMessage): m is Message =>
	typeof m === "object" && m !== null && "role" in m;

const isPrompt = (m: Message, prompt: UserMessage) =>
	m.role === "user" && m.timestamp === prompt.timestamp && m.content === prompt.content;

const hasContent = (m: Message) =>
	m.role !== "assistant" || m.content.some((c) => c.type !== "text" || c.text.trim());

/** The character's reply text pieces as they arrive. Its tool calls (and their output) go to the
 *  context's reporter; the messages it adds (the user's, then the reply's) go to `kept`. */
export async function* streamReply(
	context: CharacterContext,
	text: string,
	options: CallOptions & { kept: Message[] },
): AsyncGenerator<string | typeof TEXT_BREAK> {
	const { reporter, connection } = context;
	try {
		await memoryReady(context.characterId);
		const tools: AgentTool[] = Object.values(await toolsOf(context)).map((t) =>
			toAgentTool(t, context),
		);
		const { summary, messages } = historyForModel(context.characterId);
		const system = createInitialSystemMessage(systemPrompt(context, summary), tools);
		const prompt: UserMessage = { role: "user", content: text, timestamp: Date.now() };
		let steps = 0;
		const stream = agentLoop(
			[prompt],
			{ messages: [...(system ? [system] : []), ...messages], tools },
			{
				model: modelOf(connection),
				temperature: options.temperature,
				maxTokens: options.maxTokens,
				reasoning: thinkingLevelOf(options.effort),
				maxRetries: 0,
				sessionId: context.characterId,
				convertToLlm: (all) =>
					all
						.filter(isMessage)
						.filter(hasContent)
						.map((m) => (isPrompt(m, prompt) ? withPostHistory(prompt, context.postHistory) : m)),
				finishTurn: () => {
					steps += 1;
					if (offeredChoices(reporter) || steps >= MAX_STEPS) return { action: "end" };
				},
			},
			options.signal,
			streamFnOf(connection),
		);
		for await (const event of stream) {
			const piece = handle(event, context, options.kept);
			if (piece) yield piece;
		}
	} catch (error) {
		if (options.signal?.aborted) return;
		throw llmFailure(error);
	} finally {
		reporter.close();
	}
}

/** What an event of the agent means for the reply: text to speak, a break, or nothing. */
function handle(
	event: AgentEvent,
	context: CharacterContext,
	kept: Message[],
): string | typeof TEXT_BREAK | null {
	const { reporter } = context;
	switch (event.type) {
		case "message_update": {
			const e = event.assistantMessageEvent;
			if (e.type === "text_delta") return e.delta || null;
			if (e.type === "text_end" || e.type === "toolcall_start") return TEXT_BREAK;
			return null;
		}
		case "message_end": {
			const message = event.message;
			if (!isMessage(message)) return null;
			if (message.role === "assistant") {
				if (message.stopReason === "aborted") return null;
				const failed = assistantError(message);
				if (failed) throw failed;
			}
			if (message.role !== "system") kept.push(message);
			return null;
		}
		case "tool_execution_start":
			reporter.start(event.toolCallId, event.toolName, event.args);
			return TEXT_BREAK;
		case "tool_execution_end": {
			const result = event.result as { details?: unknown; content?: { text?: string }[] };
			const output =
				result?.details ?? result?.content?.map((c) => c.text ?? "").join("") ?? undefined;
			reporter.finish(event.toolCallId, event.isError ? "error" : "done", output);
			return null;
		}
		default:
			return null;
	}
}
