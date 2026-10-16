// A whole character as one zip, to move it to another install: its folder as it is on disk
// (store.ts), less the files speech.cpp makes again, with a marker file the import checks for.
//
//     nextroom.json   {format, version}
//     character.json         persona, voice, expressions, neutral
//     reference.png          optional
//     expressions/<id>.png   and <id>.orig.png
//     voice/                 the reference clips (refs.json, refs/) and the voice file

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type CharacterView, characterSchema } from "@nextroom/contracts";
import { unzipSync, type Zippable, zipSync } from "fflate";
import { charactersDir } from "../lib/config";
import { BadRequestError } from "../lib/errors";
import { newId, now, safeFileName, writeJson } from "../lib/storage";
import { characterDir, characterFile } from "./paths";
import { isPng } from "./png";
import { getCharacter, loadCharacter } from "./store";
import { clipFilePath, refClipIds, VOICE_FILES } from "./voice-files";

const MARKER = "nextroom.json";
const FORMAT = { format: "nextroom", version: 1 };

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value, null, 1));

/** The files besides character.json, as paths inside the folder (and the zip). */
function filePaths(expressionIds: string[], clipIds: string[]): string[] {
	return [
		"reference.png",
		...expressionIds.flatMap((id) => [`expressions/${id}.png`, `expressions/${id}.orig.png`]),
		...VOICE_FILES,
		...clipIds.map(clipFilePath),
	];
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
	for (const path of filePaths(
		character.expressions.map((e) => e.id),
		refClipIds(characterId),
	)) {
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
	character.expressions = character.expressions.filter(
		(e) => /^ex_[0-9a-f]+$/.test(e.id) && files[`expressions/${e.id}.png`],
	);
	if (!character.expressions.some((e) => e.id === character.neutral)) character.neutral = null;
	if (files["reference.png"] && !isPng(files["reference.png"])) delete files["reference.png"];

	// Written aside first, so a half-written character never shows up in the list.
	const tmp = join(charactersDir(), `.import-${character.id}`);
	rmSync(tmp, { recursive: true, force: true });
	try {
		const clipIds = clipIdsOf(files["voice/refs.json"]);
		for (const path of filePaths(
			character.expressions.map((e) => e.id),
			clipIds,
		)) {
			const data = files[path];
			if (!data) continue;
			mkdirSync(dirname(join(tmp, path)), { recursive: true });
			writeFileSync(join(tmp, path), data);
		}
		writeJson(characterFile(tmp), characterSchema, character);
		renameSync(tmp, characterDir(character.id));
	} catch (error) {
		rmSync(tmp, { recursive: true, force: true });
		throw error;
	}
	return getCharacter(character.id);
}
