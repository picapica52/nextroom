// The character's notes on the user and on the two of them (its MEMORY.md), in the memory
// database: short lines under fixed headings, which the character rewrites itself (update_memory)
// and which are brought up to date whenever older messages are summarized (context.ts). Every
// reply is given them in full, and the affinity's events read their fields (affinity/events.ts).
// Each rewrite is kept as a revision, with who made it.

import { eq } from "drizzle-orm";
import { appDb } from "../../lib/db";
import { noteRevisions, notes } from "../../lib/schema";
import { now } from "../../lib/storage";

/** The notes may be no longer than this, so they stay cheap to send with every reply. */
export const NOTES_MAX_CHARS = 4000;

export const NOTES_TEMPLATE = `# 二人の関係
- 今の関係:
- 距離感:
- 私の呼び方:
- ユーザーからの呼ばれ方:

# ユーザーへの気持ち
-

# 大事な出来事
-

# 約束
-

# 二人だけの話題
-

# 気にかけていること
-

# ユーザーについて
- 好き:
- 苦手:
- 大切にしていること:
`;

/** How the notes are kept, for whoever writes them. */
export const NOTES_RULES = [
	"The notes are the character's own, on its relationship with the user, from its point of view.",
	"Update them when the relationship moves, something meaningful happens between the two, a promise is made or kept, or the user says something about themselves that matters. Do not record the progress of a task.",
	"Write in Japanese, in short phrases, one per line. Keep the template's headings and fields.",
	"Record only what actually happened or what the user actually said; leave a field blank rather than guess, and do not make the relationship closer than it is.",
	"When something changes, rewrite the old entry instead of adding a second one. 今の関係, 距離感 and ユーザーへの気持ち describe the present.",
	"Start each line under 大事な出来事, 約束 and 気にかけていること with its date (YYYY-MM-DD). Remove a promise once it is kept or dropped, and a concern once it is settled; move it to 大事な出来事 if it matters to the two of them.",
	"気にかけていること is what the character wants to ask about or follow up on next time.",
	`Keep the whole notes under ${NOTES_MAX_CHARS} characters: merge or drop what matters least to make room.`,
];

/** Who rewrote the notes. */
export type NotesSource = "character" | "summary";

/** The notes; empty before anything is written. */
export function readNotes(characterId: string): string {
	return (
		appDb()
			.select({ content: notes.content })
			.from(notes)
			.where(eq(notes.characterId, characterId))
			.get()?.content ?? ""
	);
}

export function writeNotes(characterId: string, text: string, source: NotesSource): void {
	const content = `${text.trim()}\n`;
	const at = now();
	appDb().transaction((tx) => {
		const current = tx
			.select({ revision: notes.revision })
			.from(notes)
			.where(eq(notes.characterId, characterId))
			.get();
		const revision = (current?.revision ?? 0) + 1;
		tx.insert(notes)
			.values({ characterId, content, revision, updatedAt: at })
			.onConflictDoUpdate({
				target: notes.characterId,
				set: { content, revision, updatedAt: at },
			})
			.run();
		tx.insert(noteRevisions)
			.values({ characterId, revision, content, source, createdAt: at })
			.run();
	});
}
