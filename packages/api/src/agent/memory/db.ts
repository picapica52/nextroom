// The characters' memory, in the app's database (lib/db.ts): the messages of each conversation in
// order, the summaries that stand for their older part, and the notes with every revision of them.

import { appDb, defineTables } from "../../lib/db";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
	id TEXT PRIMARY KEY,
	character_id TEXT NOT NULL,
	seq INTEGER NOT NULL,
	at REAL NOT NULL,
	role TEXT NOT NULL,
	message TEXT NOT NULL,
	chat TEXT,
	UNIQUE (character_id, seq)
);
CREATE TABLE IF NOT EXISTS summaries (
	id TEXT PRIMARY KEY,
	character_id TEXT NOT NULL,
	at REAL NOT NULL,
	until_id TEXT NOT NULL,
	text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS summaries_character ON summaries (character_id, at);
CREATE TABLE IF NOT EXISTS notes (
	character_id TEXT PRIMARY KEY,
	content TEXT NOT NULL,
	revision INTEGER NOT NULL,
	updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS note_revisions (
	character_id TEXT NOT NULL,
	revision INTEGER NOT NULL,
	content TEXT NOT NULL,
	source TEXT NOT NULL,
	created_at REAL NOT NULL,
	PRIMARY KEY (character_id, revision)
);
`;

defineTables(SCHEMA);

export const memoryDb = appDb;

/** Forgets everything kept of the character. */
export function deleteCharacterMemory(characterId: string): void {
	const d = memoryDb();
	d.transaction(() => {
		for (const table of ["messages", "summaries", "notes", "note_revisions"])
			d.run(`DELETE FROM ${table} WHERE character_id = ?`, [characterId]);
	})();
}
