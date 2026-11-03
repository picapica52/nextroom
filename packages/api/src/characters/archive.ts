// A whole character as one zip, to move it to another install: its document and files (store.ts),
// less the files speech.cpp makes again, with a marker file the import checks for.
//
//     nextroom.json   {format, version}
//     character.json         persona, voice, agent
//     avatar.png             optional
//     voice/                 the reference clips (refs.json, refs/), the voice file and what is
//                            known about it (voice.json)

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type CharacterView, characterSchema, voiceFileInfoSchema } from "@nextroom/contracts";
import { unzipSync, type Zippable, zipSync } from "fflate";
import { charactersDir } from "../lib/config";
import { readDoc, writeDoc } from "../lib/db";
import { BadRequestError } from "../lib/errors";
import { newId, now, safeFileName } from "../lib/storage";
import { characterDir } from "./paths";
import { isPng } from "./png";
import { getCharacter, loadCharacter } from "./store";
import { clipFilePath, refClipIds, refsSchema, VOICE_FILES } from "./voice-files";

const MARKER = "nextroom.json";
const FORMAT = { format: "nextroom", version: 1 };

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value, null, 1));

/** The voice's documents, as files of the zip. */
const REFS_FILE = "voice/refs.json";
const VOICE_INFO_FILE = "voice/voice.json";

const AVATAR_FILE = "avatar.png";

/** The files besides the documents, as paths inside the folder (and the zip). */
function filePaths(clipIds: string[]): string[] {
	return [AVATAR_FILE, ...VOICE_FILES, ...clipIds.map(clipFilePath)];
}

/** The clip ids of a voice/refs.json, kept only where they are well-formed. */
function clipIdsOf(data: Uint8Array | undefined): string[] {
	if (!data) return [];
	try {
		const { clips } = JSON.parse(new TextDecoder().decode(data)) as { clips?: { id?: unknown }[] };
		return (clips ?? [])
			.map((c) => c.id)
			.filter((id): id is string => typeof id === "string" && /^ref_[0-9a-f]+$/.test(id));
	} catch {
		return [];
	}
}

export function exportArchive(characterId: string): Uint8Array {
	const character = loadCharacter(characterId);
	const dir = characterDir(characterId);
	const zip: Zippable = {
		[MARKER]: encode(FORMAT),
		"character.json": encode(character),
	};
	const refs = readDoc("voice_refs", characterId, refsSchema);
	if (refs) zip[REFS_FILE] = encode(refs);
	const info = readDoc("voice_files", characterId, voiceFileInfoSchema);
	if (info) zip[VOICE_INFO_FILE] = encode(info);
	for (const path of filePaths(refClipIds(characterId))) {
		const file = join(dir, path);
		// Stored as they are: the images are compressed already and the voice files hardly shrink.
		if (existsSync(file)) zip[path] = [readFileSync(file), { level: 0 }];
	}
	return zipSync(zip);
}

/** A file name stem for downloads (the character's name without characters Windows forbids). */
export function exportName(characterId: string): string {
	return safeFileName(loadCharacter(characterId).persona.name) || "character";
}

export const isArchive = (files: Record<string, Uint8Array>) => MARKER in files;

/** The files of a zip, by path. */
export function unzip(data: Uint8Array): Record<string, Uint8Array> {
	try {
		return unzipSync(data);
	} catch {
		throw new BadRequestError("zip ファイルを開けません");
	}
}

/** A new character from an exported zip. Only the known paths are read from it. */
export function importArchive(data: Uint8Array): CharacterView {
	const files = unzip(data);
	if (!isArchive(files)) {
		throw new BadRequestError("このアプリでエクスポートしたキャラクターの zip を選んでください");
	}
	let raw: unknown;
	try {
		raw = JSON.parse(new TextDecoder().decode(files["character.json"]));
	} catch {
		throw new BadRequestError("character.json を読み取れません");
	}
	const parsed = characterSchema.safeParse(raw);
	if (!parsed.success) throw new BadRequestError("character.json の形式が正しくありません");
	const character = parsed.data;
	character.id = newId("ch_");
	character.updated_at = now();
	character.chief = false;
	const avatar = files[AVATAR_FILE];
	if (avatar && isPng(avatar)) files[AVATAR_FILE] = avatar;
	else delete files[AVATAR_FILE];

	// Written aside first, so a half-written character never shows up in the list.
	const tmp = join(charactersDir(), `.import-${character.id}`);
	rmSync(tmp, { recursive: true, force: true });
	try {
		mkdirSync(tmp, { recursive: true });
		const clipIds = clipIdsOf(files[REFS_FILE]);
		for (const path of filePaths(clipIds)) {
			const data = files[path];
			if (!data) continue;
			mkdirSync(dirname(join(tmp, path)), { recursive: true });
			writeFileSync(join(tmp, path), data);
		}
		renameSync(tmp, characterDir(character.id));
		importVoiceDocs(character.id, files);
		writeDoc("characters", character.id, characterSchema, character);
	} catch (error) {
		rmSync(tmp, { recursive: true, force: true });
		throw error;
	}
	return getCharacter(character.id);
}

/** The voice's documents from the zip, those that can be read. */
function importVoiceDocs(characterId: string, files: Record<string, Uint8Array>) {
	const read = (path: string) => {
		const data = files[path];
		if (!data) return null;
		try {
			return JSON.parse(new TextDecoder().decode(data)) as unknown;
		} catch {
			return null;
		}
	};
	const refs = refsSchema.safeParse(read(REFS_FILE));
	if (refs.success) {
		const clips = refs.data.clips.filter((c) => files[clipFilePath(c.id)]);
		writeDoc("voice_refs", characterId, refsSchema, { clips });
	}
	const info = voiceFileInfoSchema.safeParse(read(VOICE_INFO_FILE));
	if (info.success) writeDoc("voice_files", characterId, voiceFileInfoSchema, info.data);
}
