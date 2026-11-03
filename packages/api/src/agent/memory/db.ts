// The characters' memory, in the app's database (lib/db.ts, tables in lib/schema.ts): the messages
// of each conversation in order, the summaries that stand for their older part, and the notes with
// every revision of them.

import { eq } from "drizzle-orm";
import { appDb } from "../../lib/db";
import { messages, noteRevisions, notes, summaries } from "../../lib/schema";

/** Forgets everything kept of the character. */
export function deleteCharacterMemory(characterId: string): void {
	appDb().transaction((tx) => {
		for (const t of [messages, summaries, notes, noteRevisions])
			tx.delete(t).where(eq(t.characterId, characterId)).run();
	});
}
