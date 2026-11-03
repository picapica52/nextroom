// What a character does differently from the others (its own model, the tools it does without, its
// standing instructions), kept on the character. Each change of the instructions is kept as a
// revision in `instruction_revisions`, so an earlier one can be put back.

import {
	type CharacterAgentPatch,
	type CharacterView,
	characterAgentPatchSchema,
	type InstructionRevision,
} from "@nextroom/contracts";
import { and, desc, eq, max, notInArray } from "drizzle-orm";
import { appDb } from "../lib/db";
import { parseOrBadRequest } from "../lib/errors";
import { instructionRevisions as revisions } from "../lib/schema";
import { now } from "../lib/storage";
import { loadCharacter, saveCharacter, viewOf } from "./store";

const KEPT_REVISIONS = 50;

function keepRevision(characterId: string, instructions: string): void {
	appDb().transaction((tx) => {
		const of = eq(revisions.characterId, characterId);
		const last = tx
			.select({ n: max(revisions.revision) })
			.from(revisions)
			.where(of)
			.get();
		tx.insert(revisions)
			.values({ characterId, revision: (last?.n ?? 0) + 1, instructions, createdAt: now() })
			.run();
		const kept = tx
			.select({ revision: revisions.revision })
			.from(revisions)
			.where(of)
			.orderBy(desc(revisions.revision))
			.limit(KEPT_REVISIONS);
		tx.delete(revisions)
			.where(and(of, notInArray(revisions.revision, kept)))
			.run();
	});
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
		.select({
			revision: revisions.revision,
			instructions: revisions.instructions,
			created_at: revisions.createdAt,
		})
		.from(revisions)
		.where(eq(revisions.characterId, characterId))
		.orderBy(desc(revisions.revision))
		.all();
}

export function forgetInstructionRevisions(characterId: string): void {
	appDb().delete(revisions).where(eq(revisions.characterId, characterId)).run();
}
