// Where a character's files are (see store.ts for the layout).

import { dirname, join, resolve } from "node:path";
import { charactersDir } from "../lib/config";
import { NotFoundError } from "../lib/errors";

export function characterDir(characterId: string): string {
	const path = resolve(charactersDir(), characterId);
	if (dirname(path) !== resolve(charactersDir()) || !characterId.startsWith("ch_")) {
		throw new NotFoundError(`キャラクターが見つかりません: ${characterId}`);
	}
	return path;
}

/** The character's own file (persona, voice and expressions) in its folder `dir`. */
export const characterFile = (dir: string) => join(dir, "character.json");

/** The image faces are generated from. */
export const referencePath = (characterId: string) =>
	join(characterDir(characterId), "reference.png");

export function expressionPath(characterId: string, expressionId: string): string {
	if (!/^ex_[0-9a-f]+$/.test(expressionId)) throw new NotFoundError("表情が見つかりません");
	return join(characterDir(characterId), "expressions", `${expressionId}.png`);
}

export const originalPath = (characterId: string, expressionId: string) =>
	expressionPath(characterId, expressionId).replace(/\.png$/, ".orig.png");
