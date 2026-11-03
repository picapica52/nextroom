// A character's memory, kept in the app's database (db.ts):
//
// - the conversation as it happened, with the summaries of its older part (log.ts, context.ts),
// - the character's notes on the user and the two of them, its MEMORY.md (notes.ts).

import type { MemoryOverview } from "@nextroom/contracts";
import { summaryText } from "./context";
import { deleteCharacterMemory } from "./db";
import { readNotes } from "./notes";

export { compactSoon, historyForModel, memoryReady } from "./context";
export {
	appendMessages,
	type ChatMessageEntry,
	type ChatMeta,
	listSpokenMessages,
} from "./log";
export { readNotes } from "./notes";

/** What a character remembers, for the memory screen. */
export const memoryOverview = (characterId: string): MemoryOverview => ({
	resource_id: characterId,
	working_memory: readNotes(characterId),
	summary: summaryText(characterId),
});

/** Forget everything the character holds: its conversation, summaries and notes. */
export const clearMemory = (characterId: string) => deleteCharacterMemory(characterId);
