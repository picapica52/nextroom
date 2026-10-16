// A character's faces for the call screen: adding, tagging by hand, cutting out, removing, and
// choosing the neutral one, which is also the character's picture.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Character, CharacterView, Expression, ExpressionTag } from "@nextroom/contracts";
import { cutout } from "../images/cutout";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { newId } from "../lib/storage";
import { expressionPath, originalPath } from "./paths";
import { stripCardChunks, toPng } from "./png";
import { loadCharacter, saveCharacter, viewOf } from "./store";

export function expressionOf(character: Character, expressionId: string): Expression {
	const found = character.expressions.find((e) => e.id === expressionId);
	if (!found) throw new NotFoundError("表情が見つかりません");
	return found;
}

/** The face's image before its cutout. */
export function originalImage(characterId: string, expressionId: string): Uint8Array {
	const original = originalPath(characterId, expressionId);
	return readFileSync(existsSync(original) ? original : expressionPath(characterId, expressionId));
}

/** Writes a new face's image and adds it; `neutral`: it becomes the neutral face. */
export function addFace(
	characterId: string,
	png: Uint8Array,
	expression: Expression,
	neutral = false,
): CharacterView {
	const path = expressionPath(characterId, expression.id);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, png);
	const character = loadCharacter(characterId);
	character.expressions.push(expression);
	if (neutral) makeNeutral(character, expression);
	saveCharacter(character);
	return viewOf(character);
}

export async function addExpression(
	characterId: string,
	data: Uint8Array,
	neutral = false,
): Promise<CharacterView> {
	const png = stripCardChunks(await toPng(data));
	return addFace(characterId, png, { id: newId("ex_"), tag: "", cutout: false }, neutral);
}

function makeNeutral(character: Character, expression: Expression) {
	character.neutral = expression.id;
	expression.tag = "";
}

/** Makes the face the neutral one, or (null) leaves the character without one. */
export function setNeutral(characterId: string, expressionId: string | null): CharacterView {
	const character = loadCharacter(characterId);
	if (expressionId === null) character.neutral = null;
	else makeNeutral(character, expressionOf(character, expressionId));
	saveCharacter(character);
	return viewOf(character);
}

/** The neutral face, which has to be set. */
export function neutralOf(character: Character): Expression {
	if (character.neutral === null) throw new NotFoundError("Neutral の表情が設定されていません");
	return expressionOf(character, character.neutral);
}

export function updateExpression(
	characterId: string,
	expressionId: string,
	patch: { tag?: ExpressionTag | "" | null },
): CharacterView {
	const character = loadCharacter(characterId);
	const expression = expressionOf(character, expressionId);
	if (patch.tag && character.neutral === expressionId)
		throw new BadRequestError("Neutral の表情にはタグを付けられません");
	if (patch.tag != null) expression.tag = patch.tag;
	saveCharacter(character);
	return viewOf(character);
}

export function deleteExpression(characterId: string, expressionId: string): CharacterView {
	const character = loadCharacter(characterId);
	const expression = expressionOf(character, expressionId);
	rmSync(expressionPath(characterId, expression.id), { force: true });
	rmSync(originalPath(characterId, expression.id), { force: true });
	character.expressions = character.expressions.filter((e) => e !== expression);
	if (character.neutral === expression.id) character.neutral = null;
	saveCharacter(character);
	return viewOf(character);
}

/** Make the face's background transparent, keeping the original to go back to. */
export async function cutoutExpression(
	characterId: string,
	expressionId: string,
	signal?: AbortSignal,
): Promise<CharacterView> {
	const expression = expressionOf(loadCharacter(characterId), expressionId);
	if (expression.cutout) throw new BadRequestError("この表情は透過済みです");
	const path = expressionPath(characterId, expressionId);
	const png = await cutout(readFileSync(path), signal);
	const character = loadCharacter(characterId);
	const current = expressionOf(character, expressionId);
	// Cut out by another request meanwhile: its original is the one to keep.
	if (current.cutout) return viewOf(character);
	renameSync(path, originalPath(characterId, expressionId));
	writeFileSync(path, png);
	current.cutout = true;
	saveCharacter(character);
	return viewOf(character);
}

/** Put the original image back. */
export function restoreExpression(characterId: string, expressionId: string): CharacterView {
	const character = loadCharacter(characterId);
	const expression = expressionOf(character, expressionId);
	const original = originalPath(characterId, expressionId);
	if (!expression.cutout || !existsSync(original))
		throw new BadRequestError("元の画像がありません");
	renameSync(original, expressionPath(characterId, expressionId));
	expression.cutout = false;
	saveCharacter(character);
	return viewOf(character);
}

/** Empties the tags of all the character's faces. */
export function clearExpressionTags(characterId: string): CharacterView {
	const character = loadCharacter(characterId);
	for (const expression of character.expressions) expression.tag = "";
	saveCharacter(character);
	return viewOf(character);
}
