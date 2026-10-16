// Faces handled by models: tagging one with the Decisions API, drawing new ones with the
// image model.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import {
	type CharacterView,
	type Expression,
	type ExpressionGenerate,
	type ExpressionStyle,
	type ExpressionTag,
	type ExpressionTagGuess,
	isExpressionTag,
	type NeutralGenerate,
	REFERENCE_SOURCE,
} from "@nextroom/contracts";
import { chooseForImage } from "../decisions/client";
import { generateImage } from "../images/client";
import { BadRequestError } from "../lib/errors";
import { newId } from "../lib/storage";
import { EXPRESSION_PROMPTS, NEUTRAL_PROMPT } from "./expression-prompts";
import { addFace, expressionOf, originalImage } from "./expressions";
import { expressionPath, originalPath, referencePath } from "./paths";
import { stripCardChunks, toPng } from "./png";
import { loadCharacter, saveCharacter, viewOf } from "./store";

const TAG_INSTRUCTIONS =
	"This image is one facial expression of a character, shown on a voice call screen while the " +
	"character speaks. Which expression tag describes the face best? Each tag is described by " +
	"how its face looks; pick the closest one, even if not every detail matches. Judge by the " +
	"facial features, any marks drawn on or around the face, and the pose, not by the " +
	"background or the clothes.";

function notNeutral(neutral: string | null, expressionId: string) {
	if (neutral === expressionId) throw new BadRequestError("Neutral の表情にはタグを付けられません");
}

/** Has the Decisions API look at the image and sets the tag it chose. */
export async function tagExpression(
	characterId: string,
	expressionId: string,
	signal?: AbortSignal,
): Promise<{ character: CharacterView; guess: ExpressionTagGuess }> {
	const before = loadCharacter(characterId);
	expressionOf(before, expressionId);
	notNeutral(before.neutral, expressionId);
	const answer = await chooseForImage(
		readFileSync(expressionPath(characterId, expressionId)),
		"A facial expression image of a character.",
		TAG_INSTRUCTIONS,
		EXPRESSION_PROMPTS,
		signal,
	);
	if (!isExpressionTag(answer.choice)) throw new BadRequestError("不明なタグが返りました");
	const runnerUp = answer.probabilities.find((p) => p.value !== answer.choice);
	const guess: ExpressionTagGuess = {
		tag: answer.choice,
		probability: answer.probabilities.find((p) => p.value === answer.choice)?.probability ?? 0,
		runner_up: runnerUp ? { tag: runnerUp.value, probability: runnerUp.probability } : null,
	};
	const character = loadCharacter(characterId);
	notNeutral(character.neutral, expressionId);
	expressionOf(character, expressionId).tag = answer.choice;
	saveCharacter(character);
	return { character: viewOf(character), guess };
}

type GeneratedFrom = NonNullable<Expression["generated"]>;

/** The image a face is generated from: the reference image, or another face before its cutout. */
function sourceImage(characterId: string, source: string): Uint8Array {
	if (source === REFERENCE_SOURCE) {
		if (!existsSync(referencePath(characterId)))
			throw new BadRequestError("参考画像が設定されていません");
		return readFileSync(referencePath(characterId));
	}
	expressionOf(loadCharacter(characterId), source);
	return originalImage(characterId, source);
}

const STYLE_PROMPTS: Record<ExpressionStyle, (expression: string) => string> = {
	bust: (expression) =>
		`Change the facial expression of the character in the reference image to ${expression}. ` +
		"Replace the original expression completely; do not keep any of it. Redraw the character " +
		"as an upper-body portrait, from the chest up, facing the viewer. Keep the same character, " +
		"art style, hairstyle, outfit and colors. Center the character with a little space above " +
		"the head, on a plain white background.",
	chibi: (expression) =>
		"Redraw the character in the reference image as a chibi (super-deformed) version: full " +
		"body, about two heads tall, with a large head, a small body and simplified details. Keep " +
		"the character recognizable with the same hairstyle, hair and eye colors, outfit and " +
		`accessories. Give the character this expression, exaggerated and cartoonish: ${expression}. ` +
		"Replace the original expression completely. Use the face, the pose and simple manga-style " +
		"emotion symbols where they fit. Center the " +
		"character on a plain white background.",
};

/** What to draw: an expression tag, or (null) the neutral face. */
type Face = ExpressionTag | null;

const generatePrompt = (style: ExpressionStyle, face: Face, extra: string) =>
	STYLE_PROMPTS[style](face ? EXPRESSION_PROMPTS[face] : NEUTRAL_PROMPT) +
	(extra ? `\n\nAdditional instructions: ${extra}` : "");

async function drawFace(
	characterId: string,
	face: Face,
	generated: GeneratedFrom,
	signal?: AbortSignal,
): Promise<Buffer> {
	const image = await generateImage(
		generatePrompt(generated.style, face, generated.prompt),
		sourceImage(characterId, generated.source),
		signal,
	);
	return stripCardChunks(await toPng(image));
}

/** Has the image model draw a new face with the tag, and adds it. */
export async function generateExpression(
	characterId: string,
	request: ExpressionGenerate,
	signal?: AbortSignal,
): Promise<CharacterView> {
	const generated = { source: request.source, prompt: request.prompt, style: request.style };
	const png = await drawFace(characterId, request.tag, generated, signal);
	return addFace(characterId, png, {
		id: newId("ex_"),
		tag: request.tag,
		cutout: false,
		generated,
	});
}

/** Has the image model draw the neutral face, and makes it the neutral one. The one before stays,
 *  as a face without a tag. */
export async function generateNeutral(
	characterId: string,
	request: NeutralGenerate,
	signal?: AbortSignal,
): Promise<CharacterView> {
	const generated = { source: request.source, prompt: request.prompt, style: request.style };
	const png = await drawFace(characterId, null, generated, signal);
	return addFace(characterId, png, { id: newId("ex_"), tag: "", cutout: false, generated }, true);
}

/** Draws a generated face again, from the same image, style and instructions with its current tag
 *  (or as the neutral face). It gets a new id so the screens load the new image. */
export async function regenerateExpression(
	characterId: string,
	expressionId: string,
	signal?: AbortSignal,
): Promise<CharacterView> {
	const before = loadCharacter(characterId);
	const { tag, generated } = expressionOf(before, expressionId);
	const neutral = before.neutral === expressionId;
	if (!generated) throw new BadRequestError("この表情は生成した画像ではありません");
	if (!tag && !neutral) throw new BadRequestError("タグを選んでから作り直してください");
	const png = await drawFace(characterId, neutral ? null : tag || null, generated, signal);
	const character = loadCharacter(characterId);
	const index = character.expressions.indexOf(expressionOf(character, expressionId));
	const expression: Expression = { id: newId("ex_"), tag, cutout: false, generated };
	writeFileSync(expressionPath(characterId, expression.id), png);
	rmSync(expressionPath(characterId, expressionId), { force: true });
	rmSync(originalPath(characterId, expressionId), { force: true });
	character.expressions[index] = expression;
	if (character.neutral === expressionId) character.neutral = expression.id;
	saveCharacter(character);
	return viewOf(character);
}
