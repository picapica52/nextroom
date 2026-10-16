// A conversation's messages, read back from its Mastra memory thread. What the thread's parts
// do not tell (the screen's message id, that the user spoke, the reply's tool steps and the
// images it drew) is added to the stored messages' metadata under `chat` once a turn ends. The
// images the user attached are noted in the user's text itself (images.ts).

import type { AgentStep, ChatAffinityMark, ChatMessage } from "@nextroom/contracts";
import { ThinkFilter } from "../lib/text";
import { memoryTables } from "../mastra/memory";
import { isChatTurn, type StoredDbMessage, textParts } from "../mastra/message-text";
import { splitImageNote } from "./images";

interface ChatMeta {
	id?: string;
	spoken?: boolean;
	steps?: AgentStep[];
	images?: string[];
	hidden?: boolean;
	affinity?: ChatAffinityMark;
}

const metaOf = (m: StoredDbMessage) => (m.content.metadata?.chat ?? {}) as ChatMeta;

function rawTextOf(m: StoredDbMessage): string {
	const raw = textParts(m.content).join("");
	const think = new ThinkFilter();
	return (think.feed(raw) + think.flush()).trim();
}

/** The message's words, and the images the user attached to it. */
function contentOf(m: StoredDbMessage): { text: string; images: string[] } {
	const text = rawTextOf(m);
	return m.role === "user" ? splitImageNote(text) : { text, images: [] };
}

const textOf = (m: StoredDbMessage) => contentOf(m).text;

async function storedMessages(threadId: string | string[], since?: Date) {
	const stored = await memoryTables();
	if (!stored) return [];
	const { messages } = await stored.listMessages({
		threadId,
		perPage: false,
		orderBy: { field: "createdAt", direction: "ASC" },
		...(since ? { filter: { dateRange: { start: since } } } : {}),
	});
	return messages.filter(isChatTurn);
}

type TurnMessage = Awaited<ReturnType<typeof storedMessages>>[number];

/** A thread's stored messages (oldest first) as the screen shows them, those saved from `until`
 *  on left out. Consecutive assistant messages are one reply. */
function historyOf(stored: TurnMessage[], until?: Date): ChatMessage[] {
	const out: ChatMessage[] = [];
	for (const m of stored) {
		if (until && m.createdAt >= until) break;
		const meta = metaOf(m);
		const content = contentOf(m);
		const { text } = content;
		const images = [...content.images, ...(meta.images ?? [])];
		const previous = out.at(-1);
		if (m.role === "assistant" && previous?.role === "assistant") {
			previous.text = [previous.text, text].filter(Boolean).join("");
			if (meta.steps?.length) previous.steps = [...(previous.steps ?? []), ...meta.steps];
			if (images.length) previous.images = [...(previous.images ?? []), ...images];
			continue;
		}
		out.push({
			id: meta.id ?? m.id,
			role: m.role,
			text,
			status: "done",
			...(meta.spoken ? { spoken: true } : {}),
			...(images.length ? { images } : {}),
			...(meta.steps?.length ? { steps: meta.steps } : {}),
			...(meta.hidden ? { hidden: true } : {}),
			...(meta.affinity ? { affinity: meta.affinity } : {}),
			created_at: new Date(m.createdAt).getTime() / 1000,
		});
	}
	return out.filter((m) => !m.hidden && (m.text || m.steps?.length || m.images?.length));
}

export async function threadHistory(threadId: string, until?: Date): Promise<ChatMessage[]> {
	return historyOf(await storedMessages(threadId), until);
}

/** When the resource last talked, in any of its threads; null before its first talk. */
export async function lastTalkedAt(resourceId: string): Promise<Date | null> {
	const stored = await memoryTables();
	if (!stored) return null;
	const { messages } = await stored.listMessagesByResourceId({
		resourceId,
		perPage: 20,
		orderBy: { field: "createdAt", direction: "DESC" },
	});
	const times = messages.filter(isChatTurn).map((m) => new Date(m.createdAt).getTime());
	return times.length ? new Date(Math.max(...times)) : null;
}

/** What was said in the resource's conversations: the earliest `first` and the latest `last`
 *  messages (oldest first), for looking back on them. */
export async function resourceTalk(
	resourceId: string,
	first: number,
	last: number,
): Promise<{ id: string; role: "user" | "assistant"; text: string; at: number }[]> {
	const stored = await memoryTables();
	if (!stored) return [];
	const read = async (perPage: number, direction: "ASC" | "DESC") =>
		(
			await stored.listMessagesByResourceId({
				resourceId,
				perPage,
				orderBy: { field: "createdAt", direction },
			})
		).messages
			.filter(isChatTurn)
			.filter((m) => !metaOf(m).hidden);
	const seen = new Set<string>();
	const out = [];
	for (const m of [...(await read(first, "ASC")), ...(await read(last, "DESC")).reverse()]) {
		const text = textOf(m);
		if (seen.has(m.id) || !text) continue;
		seen.add(m.id);
		out.push({ id: m.id, role: m.role, text, at: new Date(m.createdAt).getTime() / 1000 });
	}
	return out;
}

/** How many messages the screen shows of each thread, and the newest of them, read in one query. */
export async function threadSummaries(threadIds: string[]) {
	const byThread = new Map<string, TurnMessage[]>(threadIds.map((id) => [id, []]));
	if (threadIds.length) {
		for (const m of await storedMessages(threadIds)) byThread.get(m.threadId ?? "")?.push(m);
	}
	return new Map(
		[...byThread].map(([id, messages]) => {
			const shown = historyOf(messages);
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

/** Note on the turn's stored messages (saved from `since` on) what the screen showed of them. */
export async function recordTurn(
	threadId: string,
	since: Date,
	user: ChatMessage,
	reply: ChatMessage,
): Promise<void> {
	const stored = await memoryTables();
	if (!stored) return;
	const messages = await storedMessages(threadId, since);
	const firstUser = messages.findIndex((m) => m.role === "user");
	const updates = messages.flatMap((m, index) => {
		let chat: ChatMeta | null = null;
		if (index === firstUser)
			chat = {
				id: user.id,
				...(user.spoken ? { spoken: true } : {}),
				...(user.hidden ? { hidden: true } : {}),
			};
		else if (m.role === "assistant" && index > firstUser) {
			const first = messages.findIndex((n, i) => i > firstUser && n.role === "assistant");
			chat = {
				id: reply.id,
				...(index === first && reply.steps ? { steps: reply.steps } : {}),
				...(index === first && reply.images?.length ? { images: reply.images } : {}),
				...(index === first && reply.affinity ? { affinity: reply.affinity } : {}),
			};
		}
		if (!chat) return [];
		return [{ id: m.id, content: { ...m.content, metadata: { ...m.content.metadata, chat } } }];
	});
	if (updates.length) await stored.updateMessages({ messages: updates });
}
