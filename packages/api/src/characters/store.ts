// Characters: each one is a document of the database's `characters` table ({id, created_at,
// updated_at, persona, voice, agent}), with its files in its folder:
//
//     characters/<id>/avatar.png       optional, the character's picture
//     characters/<id>/voice/           the Voice Clone clips and voice file (voice-files.ts)
//     characters/<id>/images/          the conversation's images (conversations/images.ts)
//     characters/<id>/workspace/       where its file and command tools work (workspaces/store.ts)
//
// Its affinity, conversation and memory are in the database too. Neither they nor the last two
// folders are exported with the character (archive.ts).
//
// `voice` holds the TTS settings used for the character's replies, the model included; the
// files they speak with are the character's own.

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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
import { type DocTable, deleteDoc, listDocs, readDoc, writeDoc } from "../lib/db";
import { BadRequestError, NotFoundError, parseOrBadRequest } from "../lib/errors";
import { newId, now } from "../lib/storage";
import { avatarPath, characterDir } from "./paths";
import { stripCardChunks, toPng } from "./png";

export type { Character };

/** The documents kept by character id, which go with the character. */
const CHARACTER_TABLES: DocTable[] = [
	"characters",
	"affinity",
	"chat_sessions",
	"voice_refs",
	"voice_files",
];

export function loadCharacter(characterId: string): Character {
	characterDir(characterId);
	const data = readDoc("characters", characterId, characterSchema);
	if (!data) throw new NotFoundError(`キャラクターが見つかりません: ${characterId}`);
	return data;
}

export function saveCharacter(character: Character): void {
	character.updated_at = now();
	mkdirSync(characterDir(character.id), { recursive: true });
	writeDoc("characters", character.id, characterSchema, character);
}

export const viewOf = (character: Character): CharacterView => ({
	...character,
	has_avatar: existsSync(avatarPath(character.id)),
});

function summary(character: Character): CharacterSummary {
	const { persona } = character;
	return {
		id: character.id,
		name: persona.name,
		nickname: persona.nickname,
		profile: persona.profile.slice(0, 120),
		voice: character.voice.provider,
		has_avatar: existsSync(avatarPath(character.id)),
		chief: character.chief,
		created_at: character.created_at,
		updated_at: character.updated_at,
	};
}

export function listCharacters() {
	return listDocs("characters", characterSchema)
		.map((c) => summary(c.data))
		.sort((a, b) => b.updated_at - a.updated_at);
}

export const getCharacter = (characterId: string) => viewOf(loadCharacter(characterId));

export function createCharacter(
	name = "",
	persona: Partial<Persona> = {},
	options: { instructions?: string; chief?: boolean } = {},
): CharacterView {
	const character: Character = {
		id: newId("ch_"),
		created_at: now(),
		updated_at: now(),
		persona: {
			...personaSchema.parse(persona),
			name: name.trim() || NEW_CHARACTER_NAME,
		},
		voice: defaultCharacterVoice(),
		agent: { model: null, disabled_tools: [], instructions: options.instructions ?? "" },
		chief: options.chief ?? false,
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

/** Stops the chief from being deleted, before anything of it is removed. */
export function assertDeletable(characterId: string): void {
	if (loadCharacter(characterId).chief) throw new BadRequestError("チーフは削除できません");
}

export function deleteCharacter(characterId: string): void {
	assertDeletable(characterId);
	for (const table of CHARACTER_TABLES) deleteDoc(table, characterId);
	rmSync(characterDir(characterId), { recursive: true, force: true });
}

/** Sets the character's picture. Saving the character changes `updated_at`, which the picture's
 *  URL carries. */
export async function setAvatar(characterId: string, data: Uint8Array): Promise<CharacterView> {
	const png = stripCardChunks(await toPng(data));
	const character = loadCharacter(characterId);
	writeFileSync(avatarPath(characterId), png);
	saveCharacter(character);
	return viewOf(character);
}

export function removeAvatar(characterId: string): CharacterView {
	const character = loadCharacter(characterId);
	rmSync(avatarPath(characterId), { force: true });
	saveCharacter(character);
	return viewOf(character);
}
