// A character's conversation as it happened, in the memory database (db.ts): its messages in
// order, appended as turns end. A message is pi's message as the model saw it, with what the
// screen shows of it (`chat`); a summary stands for every message up to `until`, which the model
// is then given in its place (context.ts).

import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
import type { AgentStep, ChatAffinityMark } from "@nextroom/contracts";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { splitImageNote } from "../../conversations/images";
import { appDb } from "../../lib/db";
import { messages, summaries } from "../../lib/schema";

/** What the conversation screen shows of a message that the model's message does not tell. */
export interface ChatMeta {
	/** The screen's message id; the turn's assistant and tool messages share the reply's. */
	id: string;
	spoken?: boolean;
	hidden?: boolean;
	steps?: AgentStep[];
	images?: string[];
	affinity?: ChatAffinityMark;
}

export type ChatMessageEntry = {
	/** The message's own id, which the affinity's drafts cite. */
	id: string;
	/** Seconds since the epoch. */
	at: number;
	message: Exclude<Message, { role: "system" }>;
	chat?: ChatMeta;
};

export type SummaryEntry = {
	id: string;
	at: number;
	/** The last message it stands for. */
	until: string;
	text: string;
};

const columns = {
	id: messages.id,
	at: messages.at,
	message: messages.message,
	chat: messages.chat,
};

const entryOf = (row: { id: string; at: number; message: string; chat: string | null }) =>
	({
		id: row.id,
		at: row.at,
		message: JSON.parse(row.message),
		...(row.chat ? { chat: JSON.parse(row.chat) } : {}),
	}) as ChatMessageEntry;

const selectMessages = (...where: Parameters<typeof and>) =>
	appDb()
		.select(columns)
		.from(messages)
		.where(and(...where))
		.orderBy(asc(messages.seq))
		.all()
		.map(entryOf);

const of = (characterId: string) => eq(messages.characterId, characterId);

/** The character's messages, oldest first. */
function listMessages(characterId: string): ChatMessageEntry[] {
	return selectMessages(of(characterId));
}

/** The character's messages that were said aloud: the user's and the character's (not the tools'
 *  results), oldest first. */
export function listSpokenMessages(characterId: string): ChatMessageEntry[] {
	return selectMessages(of(characterId), inArray(messages.role, ["user", "assistant"]));
}

export function appendMessages(characterId: string, entries: ChatMessageEntry[]): void {
	if (!entries.length) return;
	appDb().transaction((tx) => {
		for (const e of entries) {
			const last = tx
				.select({ seq: sql<number>`COALESCE(MAX(${messages.seq}), 0)` })
				.from(messages)
				.where(of(characterId))
				.get();
			tx.insert(messages)
				.values({
					id: e.id,
					characterId,
					seq: (last?.seq ?? 0) + 1,
					at: e.at,
					role: e.message.role,
					message: JSON.stringify(e.message),
					chat: e.chat ? JSON.stringify(e.chat) : null,
				})
				.run();
		}
	});
}

export function addSummary(characterId: string, summary: SummaryEntry): void {
	appDb()
		.insert(summaries)
		.values({
			id: summary.id,
			characterId,
			at: summary.at,
			untilId: summary.until,
			text: summary.text,
		})
		.run();
}

export function latestSummary(characterId: string): SummaryEntry | null {
	return (
		appDb()
			.select({
				id: summaries.id,
				at: summaries.at,
				until: summaries.untilId,
				text: summaries.text,
			})
			.from(summaries)
			.where(eq(summaries.characterId, characterId))
			.orderBy(desc(summaries.at))
			.limit(1)
			.get() ?? null
	);
}

/** The latest summary, and the messages after it. */
export function unsummarized(characterId: string): {
	summary: SummaryEntry | null;
	messages: ChatMessageEntry[];
} {
	const summary = latestSummary(characterId);
	if (!summary) return { summary, messages: listMessages(characterId) };
	const until = appDb()
		.select({ seq: messages.seq })
		.from(messages)
		.where(eq(messages.id, summary.until))
		.get();
	return { summary, messages: selectMessages(of(characterId), gt(messages.seq, until?.seq ?? 0)) };
}

/** The words of a message, without its thinking and tool calls. */
function textOf(message: ChatMessageEntry["message"]): string {
	const { content } = message;
	if (typeof content === "string") return content;
	return content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("");
}

/** What was said, as it is shown and summarized: the words without image notes. */
export function spokenText(entry: ChatMessageEntry): string {
	const text = textOf(entry.message).trim();
	return entry.message.role === "user" ? splitImageNote(text).text : text;
}

const NO_USAGE = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

/** A reply that is only its words, for one that was cut off before it ended. */
export function textReply(text: string, at: number): AssistantMessage {
	return {
		role: "assistant",
		content: text ? [{ type: "text", text }] : [],
		api: "openai-completions",
		provider: "nextroom",
		model: "nextroom",
		usage: NO_USAGE,
		stopReason: "stop",
		timestamp: at * 1000,
	};
}
