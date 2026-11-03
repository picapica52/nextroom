// A character's conversation as it happened, in the memory database (db.ts): its messages in
// order, appended as turns end. A message is pi's message as the model saw it, with what the
// screen shows of it (`chat`); a summary stands for every message up to `until`, which the model
// is then given in its place (context.ts).

import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
import type { AgentStep, ChatAffinityMark } from "@nextroom/contracts";
import { withoutFaceTags } from "../../conversations/face-tags";
import { splitImageNote } from "../../conversations/images";
import { memoryDb } from "./db";

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

interface MessageRow {
	id: string;
	at: number;
	message: string;
	chat: string | null;
}

const entryOf = (row: MessageRow): ChatMessageEntry => ({
	id: row.id,
	at: row.at,
	message: JSON.parse(row.message),
	...(row.chat ? { chat: JSON.parse(row.chat) } : {}),
});

const COLUMNS = "id, at, message, chat";

/** The character's messages, oldest first. */
export function listMessages(characterId: string): ChatMessageEntry[] {
	return memoryDb()
		.query<MessageRow, [string]>(
			`SELECT ${COLUMNS} FROM messages WHERE character_id = ? ORDER BY seq`,
		)
		.all(characterId)
		.map(entryOf);
}

/** The character's messages that were said aloud: the user's and the character's (not the tools'
 *  results), oldest first. */
export function listSpokenMessages(characterId: string): ChatMessageEntry[] {
	return memoryDb()
		.query<MessageRow, [string]>(
			`SELECT ${COLUMNS} FROM messages WHERE character_id = ? AND role IN ('user', 'assistant') ORDER BY seq`,
		)
		.all(characterId)
		.map(entryOf);
}

export function appendMessages(characterId: string, entries: ChatMessageEntry[]): void {
	if (!entries.length) return;
	const d = memoryDb();
	const insert = d.query(
		`INSERT INTO messages (id, character_id, seq, at, role, message, chat)
		 VALUES (?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM messages WHERE character_id = ?), ?, ?, ?, ?)`,
	);
	d.transaction(() => {
		for (const e of entries) {
			insert.run(
				e.id,
				characterId,
				characterId,
				e.at,
				e.message.role,
				JSON.stringify(e.message),
				e.chat ? JSON.stringify(e.chat) : null,
			);
		}
	})();
}

export function addSummary(characterId: string, summary: SummaryEntry): void {
	memoryDb().run(
		`INSERT INTO summaries (id, character_id, at, until_id, text) VALUES (?, ?, ?, ?, ?)`,
		[summary.id, characterId, summary.at, summary.until, summary.text],
	);
}

export function latestSummary(characterId: string): SummaryEntry | null {
	return memoryDb()
		.query<SummaryEntry, [string]>(
			`SELECT id, at, until_id AS until, text FROM summaries WHERE character_id = ? ORDER BY at DESC LIMIT 1`,
		)
		.get(characterId);
}

/** The latest summary, and the messages after it. */
export function unsummarized(characterId: string): {
	summary: SummaryEntry | null;
	messages: ChatMessageEntry[];
} {
	const summary = latestSummary(characterId);
	if (!summary) return { summary, messages: listMessages(characterId) };
	const messages = memoryDb()
		.query<MessageRow, [string, string]>(
			`SELECT ${COLUMNS} FROM messages WHERE character_id = ?1
			 AND seq > COALESCE((SELECT seq FROM messages WHERE id = ?2), 0) ORDER BY seq`,
		)
		.all(characterId, summary.until)
		.map(entryOf);
	return { summary, messages };
}

/** The words of a message, without its thinking and tool calls. */
export function textOf(message: ChatMessageEntry["message"]): string {
	const { content } = message;
	if (typeof content === "string") return content;
	return content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("");
}

/** What was said, as it is shown and summarized: the words without face tags or image notes. */
export function spokenText(entry: ChatMessageEntry): string {
	const text = withoutFaceTags(textOf(entry.message)).trim();
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
