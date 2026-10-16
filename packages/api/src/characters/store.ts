// Characters on disk:
//
//     characters/<id>/character.json   {id, created_at, updated_at, persona, voice, expressions, neutral}
//     characters/<id>/reference.png    optional, the image faces are generated from
//     characters/<id>/voice/           the Voice Clone clips and voice file (voice-files.ts)
//     characters/<id>/expressions/     <expression id>.png, the faces of the call screen
//                                      (<expression id>.orig.png: the original of a cut-out face);
//                                      the neutral one is also the character's picture
//     characters/<id>/affinity.json    how close it feels to the user (affinity/store.ts)
//     characters/<id>/chat.json        its conversation (conversations/sessions.ts)
//     characters/<id>/images/          the conversation's images (conversations/images.ts)
//     characters/<id>/workspace/       where its file tools and Claude work (workspaces/store.ts)
//
// The last four are not exported with the character (archive.ts).
//
// `voice` holds the TTS settings used for the character's replies, the model included; the
// files they speak with are the character's own.

import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	type Character,
	type CharacterSummary,
	type CharacterView,
	characterSchema,
	characterVoiceSchema,
	NEW_CHARACTER_NAME,
	PERSONA_FIELDS,
	type Persona,
	personaSchema,
} from "@nextroom/contracts";
import { defaultCharacterVoice, withVoice } from "../engine/voice";
import { charactersDir } from "../lib/config";
import { BadRequestError, NotFoundError, parseOrBadRequest } from "../lib/errors";
import { newId, now, readJson, writeJson } from "../lib/storage";
import { characterDir, characterFile, referencePath } from "./paths";
import { stripCardChunks, toPng } from "./png";

export type { Character };

export function loadCharacter(characterId: string): Character {
	const data = readJson(characterFile(characterDir(characterId)), characterSchema);
	if (!data) throw new NotFoundError(`キャラクターが見つかりません: ${characterId}`);
	return data;
}

export function saveCharacter(character: Character): void {
	character.updated_at = now();
	writeJson(characterFile(characterDir(character.id)), characterSchema, character);
}

export const viewOf = (character: Character): CharacterView => ({
	...character,
	has_avatar: character.neutral !== null,
	has_reference: existsSync(referencePath(character.id)),
});

function summary(character: Character): CharacterSummary {
	const { persona } = character;
	return {
		id: character.id,
		name: persona.name,
		nickname: persona.nickname,
		profile: persona.profile.slice(0, 120),
		voice: character.voice.provider,
		has_avatar: character.neutral !== null,
		created_at: character.created_at,
		updated_at: character.updated_at,
	};
}

export function listCharacters() {
	const out = [];
	for (const name of readdirSync(charactersDir())) {
		if (!name.startsWith("ch_")) continue;
		const data = readJson(characterFile(join(charactersDir(), name)), characterSchema);
		if (data) out.push(summary(data));
	}
	return out.sort((a, b) => b.updated_at - a.updated_at);
}

export const getCharacter = (characterId: string) => viewOf(loadCharacter(characterId));

export function createCharacter(name = ""): CharacterView {
	const character: Character = {
		id: newId("ch_"),
		created_at: now(),
		updated_at: now(),
		persona: { ...personaSchema.parse({}), name: name.trim() || NEW_CHARACTER_NAME },
		voice: defaultCharacterVoice(),
		expressions: [],
		neutral: null,
	};
	saveCharacter(character);
	return viewOf(character);
}

export function updateCharacter(
	characterId: string,
	persona?: Partial<Persona> | null,
	voice?: Record<string, unknown> | null,
): CharacterView {
	const character = loadCharacter(characterId);
	for (const key of PERSONA_FIELDS) {
		const value = persona?.[key];
		if (typeof value === "string") character.persona[key] = value;
	}
	character.persona.name = character.persona.name.trim();
	if (!character.persona.name) throw new BadRequestError("名前を入力してください");
	if (voice != null) {
		character.voice = parseOrBadRequest(
			characterVoiceSchema,
			withVoice(character.voice, voice),
			"声の設定が正しくありません",
		);
	}
	saveCharacter(character);
	return viewOf(character);
}

export function deleteCharacter(characterId: string): void {
	loadCharacter(characterId);
	rmSync(characterDir(characterId), { recursive: true, force: true });
}

export async function setReference(characterId: string, data: Uint8Array): Promise<CharacterView> {
	const png = await toPng(data);
	const character = loadCharacter(characterId);
	writeFileSync(referencePath(characterId), stripCardChunks(png));
	saveCharacter(character);
	return viewOf(character);
}
