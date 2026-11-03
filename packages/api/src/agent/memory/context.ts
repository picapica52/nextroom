// What the model is given of the conversation: the latest summary, then the messages after it as
// they were said. Once those grow past COMPACT_TOKENS, the older ones are summarized (keeping the
// last KEEP_TOKENS word for word), and the notes are brought up to date with them. The summary
// keeps what happened as a dated log.

import type { Message } from "@earendil-works/pi-ai";
import { type ChatSettings, replyEffortOf } from "@nextroom/contracts";
import { newId, now } from "../../lib/storage";
import { complete, generateOnce, replyText } from "../llm";
import type { LlmConnection } from "../providers";
import { addSummary, type ChatMessageEntry, latestSummary, spokenText, unsummarized } from "./log";
import { NOTES_MAX_CHARS, NOTES_RULES, NOTES_TEMPLATE, readNotes, writeNotes } from "./notes";

/** Messages past this many tokens are summarized; the last KEEP_TOKENS of them stay as they are. */
const COMPACT_TOKENS = 30_000;
const KEEP_TOKENS = 10_000;
const SUMMARY_MAX_CHARS = 12_000;
/** A tool's result in an earlier turn is cut to this; the call itself stays. */
const OLD_RESULT_CHARS = 1500;
/** A pause this long or longer is marked with the time on the next user message. */
const GAP_SECONDS = 10 * 60;

const CJK = /[　-鿿가-힯＀-￯]/g;

/** A rough count that holds for Japanese as well as English. */
export function estimateTokens(text: string): number {
	const cjk = text.match(CJK)?.length ?? 0;
	return cjk + Math.ceil((text.length - cjk) / 4);
}

const entryTokens = (entry: ChatMessageEntry) =>
	estimateTokens(JSON.stringify(entry.message.content));

const pad = (n: number) => String(n).padStart(2, "0");

/** `2026-11-03 14:05`, in local time. */
export function stamp(at: number): string {
	const d = new Date(at * 1000);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function withTime(message: Message & { role: "user" }, at: number): Message {
	const mark = `[${stamp(at)}]`;
	const content =
		typeof message.content === "string"
			? `${mark}\n${message.content}`
			: [{ type: "text" as const, text: mark }, ...message.content];
	return { ...message, content };
}

function clipped(message: Message & { role: "toolResult" }): Message {
	const content = message.content.map((c) =>
		c.type === "text" && c.text.length > OLD_RESULT_CHARS
			? { ...c, text: `${c.text.slice(0, OLD_RESULT_CHARS)}…` }
			: c,
	);
	return { ...message, content } as Message;
}

/** The summary of what came before, and the messages since as the model is given them: with
 *  the time on a user message after a pause, and the earlier tools' results cut short. */
export function historyForModel(characterId: string): { summary: string; messages: Message[] } {
	const { summary, messages } = unsummarized(characterId);
	let previous = summary?.at ?? 0;
	const out: Message[] = [];
	for (const entry of messages) {
		const { message } = entry;
		if (message.role === "user") {
			out.push(entry.at - previous >= GAP_SECONDS ? withTime(message, entry.at) : message);
		} else if (message.role === "toolResult") {
			out.push(clipped(message));
		} else {
			out.push(message);
		}
		previous = entry.at;
	}
	return { summary: summary?.text ?? "", messages: out };
}

/** The messages as lines for the summarizer, with the tools' calls but not their results. */
function transcript(entries: ChatMessageEntry[], charName: string, userName: string): string {
	return entries
		.flatMap((entry) => {
			const { message } = entry;
			if (message.role === "toolResult") return [];
			const who = message.role === "user" ? userName : charName;
			const lines = [];
			const text = spokenText(entry);
			if (text) lines.push(`[${stamp(entry.at)}] ${who}: ${text}`);
			if (message.role === "assistant") {
				for (const c of message.content) {
					if (c.type === "toolCall")
						lines.push(
							`  (${charName} used ${c.name}: ${JSON.stringify(c.arguments).slice(0, 300)})`,
						);
				}
			}
			return lines;
		})
		.join("\n");
}

const summaryInstructions = (charName: string, userName: string) =>
	[
		`You keep the long-term memory of ${charName}, a character who talks with ${userName} through a voice-call device.`,
		"You are given the summary so far and the conversation that followed it. Write the new summary: the summary so far with what happened in the conversation added.",
		"Write it in Japanese, as a log of dated entries (YYYY-MM-DD), one short line per thing that happened, from the oldest to the newest.",
		`Keep what ${userName} said about themselves, what the two talked about, did, decided and promised, how they felt, and the details that matter later (names, numbers, places, dates).`,
		"Note what the tools were used for and how it turned out, but not what they returned.",
		"Record only what was actually said or done. Do not make anything up.",
		`Keep the whole summary under ${SUMMARY_MAX_CHARS} characters: when it would be longer, condense the oldest entries first.`,
		"Answer with the summary only.",
	].join("\n");

const notesInstructions = [
	"You update the notes a character keeps on its relationship with the user (MEMORY.md), from a stretch of their conversation.",
	...NOTES_RULES,
	"Answer with the full updated Markdown notes only, keeping what is still true.",
].join("\n");

interface CompactOptions {
	connection: LlmConnection;
	settings: ChatSettings;
	charName: string;
	userName: string;
}

const running = new Map<string, Promise<void>>();

/** Waits for the character's summary that is being written, if any. */
export async function memoryReady(characterId: string): Promise<void> {
	await running.get(characterId);
}

/** Where to cut: the older messages, ending before a turn starts, so that at least KEEP_TOKENS of
 *  the latest stay as they are. */
function olderPart(messages: ChatMessageEntry[]): ChatMessageEntry[] {
	const total = messages.reduce((n, m) => n + entryTokens(m), 0);
	if (total < COMPACT_TOKENS) return [];
	let kept = 0;
	for (let i = messages.length - 1; i > 0; i--) {
		kept += entryTokens(messages[i] as ChatMessageEntry);
		if (kept >= KEEP_TOKENS && messages[i]?.message.role === "user") return messages.slice(0, i);
	}
	return [];
}

async function compact(characterId: string, options: CompactOptions): Promise<void> {
	const { summary, messages } = unsummarized(characterId);
	const older = olderPart(messages);
	const last = older.at(-1);
	if (!last) return;
	const { connection, settings, charName, userName } = options;
	const lines = transcript(older, charName, userName);
	const call = { temperature: 0.3, effort: replyEffortOf(settings) };
	const text = await generateOnce(
		connection,
		summaryInstructions(charName, userName),
		[
			`<summary_so_far>\n${summary?.text || "(none)"}\n</summary_so_far>`,
			`<conversation>\n${lines}\n</conversation>`,
		].join("\n\n"),
		call,
	);
	addSummary(characterId, { id: newId("sum_"), at: now(), until: last.id, text });
	try {
		const notes = await complete(
			connection,
			notesInstructions,
			[
				{
					role: "user",
					content: [
						`<template>\n${NOTES_TEMPLATE}</template>`,
						`<current_notes>\n${readNotes(characterId) || "(none)"}\n</current_notes>`,
						`<conversation>\n${lines}\n</conversation>`,
					].join("\n\n"),
					timestamp: Date.now(),
				},
			],
			call,
		);
		const updated = replyText(notes);
		if (updated.startsWith("#"))
			writeNotes(characterId, updated.slice(0, NOTES_MAX_CHARS * 2), "summary");
	} catch (error) {
		console.warn(`Could not update the notes of character ${characterId}:`, error);
	}
}

/** Summarizes the older messages when there are too many, in the background; the next reply
 *  waits for it (memoryReady). */
export function compactSoon(characterId: string, options: CompactOptions): void {
	if (running.has(characterId)) return;
	if (!olderPart(unsummarized(characterId).messages).length) return;
	const run = compact(characterId, options)
		.catch((error) => console.warn(`Could not summarize the memory of ${characterId}:`, error))
		.finally(() => running.delete(characterId));
	running.set(characterId, run);
}

/** The latest summary, for the memory screen. */
export const summaryText = (characterId: string) => latestSummary(characterId)?.text ?? "";
