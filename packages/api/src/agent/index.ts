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
import type { ToolGroup } from "@nextroom/contracts";
import type { CharacterContext } from "./context";
import { assistantError, type CallOptions, llmFailure } from "./llm";
import { historyForModel, memoryReady, readNotes } from "./memory";
import { NOTES_TEMPLATE } from "./memory/notes";
import { toolGuide } from "./prompts";
import { type LlmConnection, modelOf, streamFnOf, thinkingLevelOf } from "./providers";
import { type ToolSet, toAgentTool } from "./tool";
import { askUserTools, offeredChoices } from "./tools/ask-user";
import { composioTools } from "./tools/composio";
import { desktopTools, hasDesktop } from "./tools/desktop";
import { findTopicTools } from "./tools/find-topic";
import { memoryTools } from "./tools/memory";
import { routineTools } from "./tools/routines";
import { sandboxTools } from "./tools/sandbox";
import { webSearchTools } from "./tools/web-search";

export { generateOnce } from "./llm";
export { irodoriVoice } from "./voice";

/** Tool calls the agent may chain in one reply before it has to answer. */
const MAX_STEPS = 12;

/** Yielded by streamReply where a run of text ends (e.g. before a tool call): whatever was
 *  said so far is complete and should be spoken now, not when the next text arrives. */
export const TEXT_BREAK = Symbol("text-break");

/** Every tool the settings turn on, less the groups the character does without. */
async function toolsOf(context: CharacterContext): Promise<ToolSet> {
	const { settings, connection, disabledTools } = context;
	const groups: [ToolGroup, () => ToolSet | Promise<ToolSet>][] = [
		["web_search", () => webSearchTools(settings)],
		["topic_search", () => findTopicTools(settings)],
		["desktop", () => desktopTools(settings, connection)],
		["workspace", () => sandboxTools(settings)],
		["ask_user", () => askUserTools(settings)],
		["routines", () => routineTools(settings)],
		["apps", () => composioTools(settings)],
	];
	const tools: ToolSet = { ...memoryTools() };
	for (const [group, make] of groups) {
		if (!disabledTools.includes(group)) Object.assign(tools, await make());
	}
	return tools;
}

const section = (title: string, body: string) => (body.trim() ? `# ${title}\n${body.trim()}` : "");

/** The system prompt: the instructions and tools, the persona, then what the character holds
 *  in memory (which changes less often the earlier it comes, for the prompt cache). */
function systemPrompt(context: CharacterContext, summary: string): string {
	const notes = readNotes(context.characterId);
	return [
		context.system,
		toolGuide(
			context.settings,
			hasDesktop(context.settings, context.connection) &&
				!context.disabledTools.includes("desktop"),
		),
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

/** A model failed before the reply said or did anything, so the next one can take over. */
class NothingSaid extends Error {
	constructor(readonly cause: Error) {
		super(cause.message);
	}
}

/** The character's reply text pieces as they arrive. Its tool calls (and their output) go to the
 *  context's reporter; the messages it adds (the user's, then the reply's) go to `kept`. When a
 *  model fails before the reply says or does anything, the next of the context's connections
 *  takes over. */
export async function* streamReply(
	context: CharacterContext,
	text: string,
	options: CallOptions & { kept: Message[] },
): AsyncGenerator<string | typeof TEXT_BREAK> {
	const { reporter } = context;
	try {
		await memoryReady(context.characterId);
		const tools: AgentTool[] = Object.values(await toolsOf(context)).map((t) =>
			toAgentTool(t, context),
		);
		const { summary, messages } = historyForModel(context.characterId);
		const system = createInitialSystemMessage(systemPrompt(context, summary), tools);
		const history = [...(system ? [system] : []), ...messages];
		const prompt: UserMessage = { role: "user", content: text, timestamp: Date.now() };
		for (const [index, connection] of context.connections.entries()) {
			const last = index === context.connections.length - 1;
			options.kept.length = 0;
			try {
				yield* replyWith(connection, context, history, tools, prompt, options, last);
				return;
			} catch (error) {
				if (!(error instanceof NothingSaid)) throw error;
				if (last) throw error.cause;
				console.warn(
					`${connection.provider}/${connection.model} failed, trying the next model:`,
					error.cause,
				);
			}
		}
	} catch (error) {
		if (options.signal?.aborted) return;
		throw llmFailure(error);
	} finally {
		reporter.close();
	}
}

async function* replyWith(
	connection: LlmConnection,
	context: CharacterContext,
	history: Message[],
	tools: AgentTool[],
	prompt: UserMessage,
	options: CallOptions & { kept: Message[] },
	last: boolean,
): AsyncGenerator<string | typeof TEXT_BREAK> {
	const { reporter } = context;
	let steps = 0;
	let said = false;
	const stream = agentLoop(
		[prompt],
		{ messages: history, tools },
		{
			model: modelOf(connection),
			temperature: options.temperature,
			maxTokens: options.maxTokens,
			reasoning: thinkingLevelOf(connection),
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
		let piece: ReturnType<typeof handle>;
		try {
			piece = handle(event, context, options.kept);
		} catch (error) {
			if (!said && !last && error instanceof Error) throw new NothingSaid(error);
			throw error;
		}
		if (piece === null) continue;
		if (piece !== TEXT_BREAK || event.type === "tool_execution_start") said = true;
		yield piece;
	}
}

/** A tool's result as it is kept: the screenshots it showed the model are seen once, not stored
 *  with the conversation and sent again with every later reply. */
function withoutImages(message: Message): Message {
	if (message.role !== "toolResult" || !message.content.some((c) => c.type === "image"))
		return message;
	const content = message.content.map((c) =>
		c.type === "image" ? { type: "text" as const, text: "[A screenshot was shown here.]" } : c,
	);
	return { ...message, content };
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
			if (message.role !== "system") kept.push(withoutImages(message));
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
