// A character's one memory thread, named by the character's id.

import type { Memory } from "@mastra/memory";

import { clearObservations } from "./store";

/** Where a character's memory is kept. */
export const characterResource = (characterId: string) => `character:${characterId}`;

/** The character's thread, created on its first turn. */
export async function prepareThread(memory: Memory, characterId: string): Promise<void> {
	if (await memory.getThreadById({ threadId: characterId })) return;
	await memory.createThread({
		threadId: characterId,
		resourceId: characterResource(characterId),
		title: "会話",
	});
}

/** The character's thread goes with its messages, vectors, observations and working memory. */
export async function forgetThread(memory: Memory, characterId: string): Promise<void> {
	if (!(await memory.getThreadById({ threadId: characterId }))) return;
	await memory.deleteThread(characterId);
	await clearObservations(characterId, characterResource(characterId));
}
