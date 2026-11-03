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

/** The character's picture. */
export const avatarPath = (characterId: string) => join(characterDir(characterId), "avatar.png");
