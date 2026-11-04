// A conversation's messages, read back from the character's memory database (agent/memory). What
// the model's messages do not tell (the screen's message id, that the user spoke, the reply's tool
// steps and the photos it sent) is kept with them as `chat` when the turn ends. The images the
// user attached are noted in the user's text itself (images.ts).

import type { Message } from "@earendil-works/pi-ai";
import type { ChatMessage } from "@nextroom/contracts";
import {
	appendMessages,
	type ChatMessageEntry,
	type ChatMeta,
	listSpokenMessages,
} from "../agent/memory";
import { spokenText, textReply } from "../agent/memory/log";
import { newId, now } from "../lib/storage";
import { ThinkFilter } from "../lib/text";
import { splitImageNote } from "./images";

function withoutThinking(text: string): string {
	const think = new ThinkFilter();
	return (think.feed(text) + think.flush()).trim();
}

/** The user's and the character's messages, without the tools' results. */
const chatEntries = listSpokenMessages;

/** The stored messages (oldest first) as the screen shows them, those from `until` on left out.
 *  A reply's messages (its steps between tool calls) are one. */
function historyOf(entries: ChatMessageEntry[], until?: Date): ChatMessage[] {
	const out: ChatMessage[] = [];
	const cutoff = until ? until.getTime() / 1000 : Number.POSITIVE_INFINITY;
	for (const entry of entries) {
		if (entry.at >= cutoff) break;
		const meta = entry.chat ?? { id: entry.id };
		const role = entry.message.role as "user" | "assistant";
		const raw = withoutThinking(spokenText(entry));
		const { text, images: attached } =
			role === "user" ? splitImageNote(raw) : { text: raw, images: [] as string[] };
		const images = [...attached, ...(meta.images ?? [])];
		const previous = out.at(-1);
		if (role === "assistant" && previous?.role === "assistant" && previous.id === meta.id) {
			previous.text = [previous.text, text].filter(Boolean).join("");
			if (meta.steps?.length) previous.steps = [...(previous.steps ?? []), ...meta.steps];
			if (images.length) previous.images = [...(previous.images ?? []), ...images];
			if (meta.affinity) previous.affinity = meta.affinity;
			continue;
		}
		out.push({
			id: meta.id,
			role,
			text,
			status: "done",
			...(meta.spoken ? { spoken: true } : {}),
			...(images.length ? { images } : {}),
			...(meta.steps?.length ? { steps: meta.steps } : {}),
			...(meta.hidden ? { hidden: true } : {}),
			...(meta.affinity ? { affinity: meta.affinity } : {}),
			created_at: entry.at,
		});
	}
	return out.filter((m) => !m.hidden && (m.text || m.steps?.length || m.images?.length));
}

export function threadHistory(characterId: string, until?: Date): ChatMessage[] {
	return historyOf(chatEntries(characterId), until);
}

/** When the character last talked with the user; null before their first talk. */
export function lastTalkedAt(characterId: string): Date | null {
	const last = chatEntries(characterId).at(-1);
	return last ? new Date(last.at * 1000) : null;
}

/** What was said in the conversation: the earliest `first` and the latest `last` messages
 *  (oldest first), for looking back on it. */
export function resourceTalk(
	characterId: string,
	first: number,
	last: number,
): { id: string; role: "user" | "assistant"; text: string; at: number }[] {
	const said = chatEntries(characterId).filter((e) => !e.chat?.hidden);
	const picked = [...said.slice(0, first), ...said.slice(Math.max(first, said.length - last))];
	return picked.flatMap((e) => {
		const text = withoutThinking(spokenText(e));
		return text ? [{ id: e.id, role: e.message.role as "user" | "assistant", text, at: e.at }] : [];
	});
}

/** How many messages the screen shows of each conversation, and the newest of them. */
export function threadSummaries(characterIds: string[]) {
	return new Map(
		characterIds.map((id) => {
			const shown = threadHistory(id);
			const last = shown.findLast((m) => m.text);
			return [
				id,
				{
					count: shown.length,
					last: last ? { role: last.role, text: last.text, created_at: last.created_at } : null,
				},
			];
		}),
	);
}

const userMeta = (user: ChatMessage): ChatMeta => ({
	id: user.id,
	...(user.spoken ? { spoken: true } : {}),
	...(user.hidden ? { hidden: true } : {}),
});

/** Keeps the turn's messages, with what the screen showed of them: the user's message, then the
 *  reply's (its steps, images and affinity on the first of them). */
export function recordTurn(
	characterId: string,
	user: ChatMessage,
	reply: ChatMessage,
	messages: Message[],
): void {
	let first = true;
	const entries = messages.flatMap((message): ChatMessageEntry[] => {
		if (message.role === "system") return [];
		const at = message.timestamp / 1000;
		if (message.role === "user") {
			return [{ id: newId("msg_"), at, message, chat: userMeta(user) }];
		}
		const chat: ChatMeta = { id: reply.id };
		if (message.role === "assistant" && first) {
			first = false;
			if (reply.steps?.length) chat.steps = reply.steps;
			if (reply.images?.length) chat.images = reply.images;
			if (reply.affinity) chat.affinity = reply.affinity;
		}
		return [{ id: newId("msg_"), at, message, chat }];
	});
	appendMessages(characterId, entries);
}

/** Keeps a turn that did not end well as far as it got: the user's message, and the words of the
 *  reply so far (without its tool calls), so the next reply knows what was said. */
export function recordBrokenTurn(
	characterId: string,
	user: ChatMessage,
	userText: string,
	reply: ChatMessage,
): void {
	const at = now();
	const entries: ChatMessageEntry[] = [
		{
			id: newId("msg_"),
			at,
			message: { role: "user", content: userText, timestamp: at * 1000 },
			chat: userMeta(user),
		},
	];
	if (reply.text.trim()) {
		entries.push({
			id: newId("msg_"),
			at,
			message: textReply(reply.text.trim(), at),
			chat: {
				id: reply.id,
				...(reply.steps?.length ? { steps: reply.steps } : {}),
				...(reply.images?.length ? { images: reply.images } : {}),
			},
		});
	}
	appendMessages(characterId, entries);
}
