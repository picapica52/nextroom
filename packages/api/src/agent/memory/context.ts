// What the model is given of the conversation: the latest summary, then the messages after it as
// they were said. Once WINDOW_MESSAGES + BATCH_MESSAGES of them have piled up, the oldest
// BATCH_MESSAGES are summarized, and the notes are brought up to date with them. The summary
// keeps what happened as a dated log.

import type { Message } from "@earendil-works/pi-ai";
import { estimateContextTokens } from "@earendil-works/pi-ai/utils/estimate";
import { localDate, pad2 } from "../../lib/dates";
import { newId, now } from "../../lib/storage";
import { complete, generateOnce, replyText } from "../llm";
import type { LlmConnection } from "../providers";
import { addSummary, type ChatMessageEntry, latestSummary, spokenText, unsummarized } from "./log";
import { NOTES_MAX_CHARS, NOTES_RULES, NOTES_TEMPLATE, readNotes, writeNotes } from "./notes";

/** Messages counted are the user's and the character's spoken ones (not tool calls or results).
 *  At least WINDOW_MESSAGES stay as they are; the oldest BATCH_MESSAGES are summarized at a time. */
const WINDOW_MESSAGES = 50;
const BATCH_MESSAGES = 50;
/** A pause this long or longer is marked with the time on the next user message. */
const GAP_SECONDS = 10 * 60;

const counted = (entry: ChatMessageEntry) =>
	entry.message.role === "user" || (entry.message.role === "assistant" && !!spokenText(entry));

/** `2026-11-03 14:05`, in local time. */
export function stamp(at: number): string {
	const d = new Date(at * 1000);
	return `${localDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function withTime(message: Message & { role: "user" }, at: number): Message {
	const mark = `[${stamp(at)}]`;
	const content =
		typeof message.content === "string"
			? `${mark}\n${message.content}`
			: [{ type: "text" as const, text: mark }, ...message.content];
	return { ...message, content };
}

/** The summary of what came before, and the messages since as the model is given them: with
 *  the time on a user message after a pause. */
export function historyForModel(characterId: string): { summary: string; messages: Message[] } {
	const { summary, messages } = unsummarized(characterId);
	let previous = summary?.at ?? 0;
	const out: Message[] = [];
	for (const entry of messages) {
		const { message } = entry;
		out.push(
			message.role === "user" && entry.at - previous >= GAP_SECONDS
				? withTime(message, entry.at)
				: message,
		);
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
		"Answer with the summary only.",
	].join("\n");

const notesInstructions = [
	"You update the notes a character keeps on its relationship with the user (MEMORY.md), from a stretch of their conversation.",
	...NOTES_RULES,
	"Answer with the full updated Markdown notes only, keeping what is still true.",
].join("\n");

interface CompactOptions {
	connection: LlmConnection;
	charName: string;
	userName: string;
}

const running = new Map<string, Promise<void>>();

/** Waits for the character's summary that is being written, if any. */
export async function memoryReady(characterId: string): Promise<void> {
	await running.get(characterId);
}

/** The oldest BATCH_MESSAGES, cut before the next turn starts, once there are enough messages. */
function olderPart(messages: ChatMessageEntry[]): ChatMessageEntry[] {
	if (messages.filter(counted).length < WINDOW_MESSAGES + BATCH_MESSAGES) return [];
	let seen = 0;
	for (let i = 0; i < messages.length; i++) {
		const entry = messages[i] as ChatMessageEntry;
		if (seen >= BATCH_MESSAGES && entry.message.role === "user") return messages.slice(0, i);
		if (counted(entry)) seen++;
	}
	return [];
}

async function compact(characterId: string, options: CompactOptions): Promise<void> {
	const { summary, messages } = unsummarized(characterId);
	const older = olderPart(messages);
	const last = older.at(-1);
	if (!last) return;
	const { connection, charName, userName } = options;
	const lines = transcript(older, charName, userName);
	const call = { temperature: 0.3 };
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

/** About how many tokens the next reply starts from: what the provider reported for the latest
 *  reply, and an estimate of what came after it (or of everything, until a reply after the
 *  latest summary). The system prompt and tools count only through the reported part. */
export function contextTokens(characterId: string): number {
	const summary = latestSummary(characterId);
	const { messages } = historyForModel(characterId);
	const prefix: Message[] = summary
		? [{ role: "user", content: summary.text, timestamp: summary.at * 1000 }]
		: [];
	return estimateContextTokens([...prefix, ...messages]).tokens;
}

/** The latest summary, for the memory screen. */
export const summaryText = (characterId: string) => latestSummary(characterId)?.text ?? "";
