// Conversations: each character has one, kept in its folder as `chat.json`. Its
// messages are in the character's Mastra memory thread (see history), and the turn in progress is
// kept in memory (see live-turn). Neither the microphone recordings nor the synthesized replies
// are kept. The character's persona shapes the system prompt and its voice speaks the replies.

import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import {
	type ChatSession,
	type ChatSessionRecord,
	type ChatSessionSummary,
	chatSessionRecordSchema,
} from "@nextroom/contracts";

import { characterDir } from "../characters/paths";
import { getCharacter, listCharacters } from "../characters/store";
import { charactersDir } from "../lib/config";
import { queue } from "../lib/jobs";
import { now, readJson, writeJson } from "../lib/storage";
import { threadHistory, threadSummaries } from "./history";
import { dropTurn, liveTurn, speechOf } from "./live-turn";

const sessionFile = (sessionId: string) => join(characterDir(sessionId), "chat.json");
/** The images of the conversation (see images.ts). */
export const imagesDir = (sessionId: string) => join(characterDir(sessionId), "images");

/** The character's conversation, made the first time it is asked for. */
export function loadSession(characterId: string): ChatSessionRecord {
	getCharacter(characterId);
	const stored = readJson(sessionFile(characterId), chatSessionRecordSchema);
	if (stored) return stored;
	const session: ChatSessionRecord = {
		id: characterId,
		created_at: now(),
		updated_at: now(),
	};
	saveSession(session);
	return session;
}

export function saveSession(session: ChatSessionRecord): void {
	session.updated_at = now();
	writeJson(sessionFile(session.id), chatSessionRecordSchema, session);
}

function storedSessions(): ChatSessionRecord[] {
	const out = [];
	for (const name of readdirSync(charactersDir(), { withFileTypes: true })) {
		if (!name.isDirectory() || !name.name.startsWith("ch_")) continue;
		const data = readJson(sessionFile(name.name), chatSessionRecordSchema);
		if (data) out.push(data);
	}
	return out;
}

/** Every character's conversation, the newest talk first; characters never talked to last. */
export async function listSessions(): Promise<ChatSessionSummary[]> {
	const characters = listCharacters();
	const stored = new Map(storedSessions().map((s) => [s.id, s]));
	const threads = await threadSummaries(characters.map((c) => c.id));
	const out = characters.map((character): ChatSessionSummary => {
		const session = stored.get(character.id);
		const thread = threads.get(character.id);
		return {
			id: character.id,
			character_id: character.id,
			character_name: character.name,
			created_at: session?.created_at ?? character.created_at,
			updated_at: session?.updated_at ?? character.created_at,
			message_count: thread?.count ?? 0,
			last_message: thread?.last ?? null,
		};
	});
	const lastAt = (s: ChatSessionSummary) => s.last_message?.created_at ?? -1;
	return out.sort((a, b) => lastAt(b) - lastAt(a) || b.updated_at - a.updated_at);
}

/** The character's conversation with its messages: the thread's, then the turn in progress. */
export async function getSession(characterId: string): Promise<ChatSession> {
	const session = loadSession(characterId);
	const turn = liveTurn(characterId);
	const messages = [
		...(await threadHistory(characterId, turn?.startedAt)),
		...(turn?.messages ?? []).filter((m) => !m.hidden),
	];
	const last = messages.findLast((m) => m.text);
	return {
		...session,
		character_id: characterId,
		character_name: getCharacter(characterId).persona.name,
		message_count: messages.length,
		last_message: last ? { role: last.role, text: last.text, created_at: last.created_at } : null,
		messages,
		speech: speechOf(characterId),
	};
}

/** How many characters other than `characterId` the user talked with since `since`. */
export function otherCharactersTalks(characterId: string, since: number): number {
	return storedSessions().filter((s) => s.id !== characterId && s.updated_at >= since).length;
}

/** Ends the turn in progress and deletes what the conversation kept beside its thread: its
 *  file and the images. */
export function clearSession(characterId: string): void {
	for (const message of liveTurn(characterId)?.messages ?? []) {
		if (message.job_id) queue.cancel(message.job_id);
	}
	dropTurn(characterId);
	rmSync(imagesDir(characterId), { recursive: true, force: true });
	rmSync(sessionFile(characterId), { force: true });
}
