// What a character does differently from the others (its own model, the tools it does without, its
// standing instructions), kept on the character. Each change of the instructions is kept as a
// revision in `instruction_revisions`, so an earlier one can be put back.

import {
	type CharacterAgentPatch,
	type CharacterView,
	characterAgentPatchSchema,
	type InstructionRevision,
} from "@nextroom/contracts";
import { appDb, defineTables } from "../lib/db";
import { parseOrBadRequest } from "../lib/errors";
import { now } from "../lib/storage";
import { loadCharacter, saveCharacter, viewOf } from "./store";

defineTables(`
CREATE TABLE IF NOT EXISTS instruction_revisions (
	character_id TEXT NOT NULL,
	revision INTEGER NOT NULL,
	instructions TEXT NOT NULL,
	created_at REAL NOT NULL,
	PRIMARY KEY (character_id, revision)
);
`);

const KEPT_REVISIONS = 50;

function keepRevision(characterId: string, instructions: string): void {
	const d = appDb();
	d.transaction(() => {
		const last = d
			.query<{ n: number | null }, [string]>(
				`SELECT MAX(revision) AS n FROM instruction_revisions WHERE character_id = ?`,
			)
			.get(characterId);
		d.run(
			`INSERT INTO instruction_revisions (character_id, revision, instructions, created_at)
			 VALUES (?, ?, ?, ?)`,
			[characterId, (last?.n ?? 0) + 1, instructions, now()],
		);
		d.run(
			`DELETE FROM instruction_revisions WHERE character_id = ?1 AND revision NOT IN
			 (SELECT revision FROM instruction_revisions WHERE character_id = ?1
			  ORDER BY revision DESC LIMIT ?2)`,
			[characterId, KEPT_REVISIONS],
		);
	})();
}

export function updateCharacterAgent(
	characterId: string,
	patch: CharacterAgentPatch,
): CharacterView {
	const changes = parseOrBadRequest(characterAgentPatchSchema, patch);
	const character = loadCharacter(characterId);
	const before = character.agent.instructions;
	character.agent = {
		...character.agent,
		...Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)),
	};
	saveCharacter(character);
	if (changes.instructions !== undefined && changes.instructions !== before)
		keepRevision(characterId, changes.instructions);
	return viewOf(character);
}

/** The instructions as they were after each change, the newest first. */
export function instructionRevisions(characterId: string): InstructionRevision[] {
	loadCharacter(characterId);
	return appDb()
		.query<InstructionRevision, [string]>(
			`SELECT revision, instructions, created_at FROM instruction_revisions
			 WHERE character_id = ? ORDER BY revision DESC`,
		)
		.all(characterId);
}

export function forgetInstructionRevisions(characterId: string): void {
	appDb().run(`DELETE FROM instruction_revisions WHERE character_id = ?`, [characterId]);
}
