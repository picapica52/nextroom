// Choice questions asked through OpenRouter's Decisions router (System One format): about one
// image, or about text. The model is in the expression settings, the key in the connection
// settings.

import sharp from "sharp";

import { BadRequestError, ConflictError } from "../lib/errors";
import { postOpenrouter, requireOpenrouterKey } from "../lib/openrouter";
import { loadSettings, openrouterApiKey } from "../settings/chat";

/** OpenRouter asks for images under about 300 KB. */
const IMAGE_SIZE = 512;

interface Probability {
	value: string;
	probability: number;
}

interface Choice {
	choice: string;
	/** By option, highest first. */
	probabilities: Probability[];
}

interface Answer {
	type?: string;
	choice?: string;
	probabilities?: Record<string, number>;
}

type StatePart = string | { type: "image_url"; image_url: { url: string } };

const toWebpDataUrl = async (png: Uint8Array) => {
	const webp = await sharp(png)
		.resize(IMAGE_SIZE, IMAGE_SIZE, { fit: "inside", withoutEnlargement: true })
		.webp({ quality: 85 })
		.toBuffer();
	return `data:image/webp;base64,${webp.toString("base64")}`;
};

/** Whether a Decisions model is set, so `choose` can be asked. */
export const canDecide = () => !!loadSettings().image_tag_model;

/** Which key of `criteria` (option → what it means, in English) fits `state`. */
async function choose(
	state: StatePart[],
	instructions: string,
	criteria: Record<string, string>,
	signal?: AbortSignal,
): Promise<Choice> {
	const s = loadSettings();
	const key = requireOpenrouterKey(openrouterApiKey());
	const model = s.image_tag_model;
	if (!model) throw new BadRequestError("設定 → モデル で 表情の判定 のモデルを選んでください");

	const body = await postOpenrouter<{ answers?: { answer?: Answer } }>(
		key,
		"/alpha/decisions",
		{ model, state, questions: { answer: { type: "choice", instructions, criteria } } },
		signal,
	);
	const answer = body?.answers?.answer;
	if (answer?.type === "refusal") throw new ConflictError("OpenRouter がこの判定を断りました");
	if (answer?.type !== "choice" || !answer.choice || !(answer.choice in criteria))
		throw new ConflictError("OpenRouter から読めない答えが返りました");
	return {
		choice: answer.choice,
		probabilities: Object.entries(answer.probabilities ?? {})
			.map(([value, probability]) => ({ value, probability }))
			.sort((a, b) => b.probability - a.probability),
	};
}

/** Which key of `criteria` fits a PNG image. */
export async function chooseForImage(
	png: Uint8Array,
	text: string,
	instructions: string,
	criteria: Record<string, string>,
	signal?: AbortSignal,
): Promise<Choice> {
	const image = await toWebpDataUrl(png);
	return choose(
		[text, { type: "image_url", image_url: { url: image } }],
		instructions,
		criteria,
		signal,
	);
}

/** Which key of `criteria` fits a text. */
export const chooseForText = (
	text: string,
	instructions: string,
	criteria: Record<string, string>,
	signal?: AbortSignal,
): Promise<Choice> => choose([text], instructions, criteria, signal);
