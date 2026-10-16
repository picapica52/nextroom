// Image models through OpenRouter's Images API. Expression images and the character's image tool
// both use the image model of the settings. The OpenRouter key is in the connection settings.

import sharp from "sharp";

import { BadRequestError, ConflictError } from "../lib/errors";
import { postOpenrouter, requireOpenrouterKey } from "../lib/openrouter";
import { loadSettings, openrouterApiKey } from "../settings/chat";

/** The reference is sent no larger than this on its longer side. */
const REFERENCE_SIZE = 1024;

/** Transparent parts become white: models draw whatever color a cutout's hidden pixels have. */
const toReferencePng = (image: Uint8Array) =>
	sharp(image)
		.flatten({ background: "#ffffff" })
		.resize(REFERENCE_SIZE, REFERENCE_SIZE, { fit: "inside", withoutEnlargement: true })
		.png()
		.toBuffer();

interface ImagesResponse {
	data?: { b64_json?: string; url?: string }[];
}

export interface OpenrouterDrawing {
	model: string;
	prompt: string;
	/** Images the model draws from (none: from the prompt alone). */
	references: Uint8Array[];
	n: number;
	aspectRatio: string;
}

/** The images an OpenRouter model drew, in whatever format it gave them. */
export async function drawWithOpenrouter(
	drawing: OpenrouterDrawing,
	signal?: AbortSignal,
): Promise<Uint8Array[]> {
	const key = requireOpenrouterKey(openrouterApiKey());
	const body = await postOpenrouter<ImagesResponse>(
		key,
		"/v1/images",
		Promise.all(drawing.references.map(toReferencePng)).then((pngs) => ({
			model: drawing.model,
			prompt: drawing.prompt,
			n: drawing.n,
			aspect_ratio: drawing.aspectRatio,
			resolution: "1K",
			...(pngs.length
				? {
						input_references: pngs.map((png) => ({
							type: "image_url",
							image_url: { url: `data:image/png;base64,${png.toString("base64")}` },
						})),
					}
				: {}),
		})),
		signal,
	);
	const images: Uint8Array[] = [];
	for (const image of body?.data ?? []) {
		if (image.b64_json) images.push(Buffer.from(image.b64_json, "base64"));
		else if (image.url) {
			const download = await fetch(image.url, { signal });
			if (download.ok) images.push(new Uint8Array(await download.arrayBuffer()));
		}
	}
	if (!images.length) throw new ConflictError("OpenRouter から画像が返りませんでした");
	return images;
}

/** One image drawn from `prompt` and the reference image, in whatever format the model gave. */
export async function generateImage(
	prompt: string,
	reference: Uint8Array,
	signal?: AbortSignal,
): Promise<Uint8Array> {
	const model = loadSettings().image_gen_model;
	if (!model) throw new BadRequestError("設定 → モデル で 画像の生成 のモデルを選んでください");
	const [image] = await drawWithOpenrouter(
		{ model, prompt, references: [reference], n: 1, aspectRatio: "1:1" },
		signal,
	);
	return image as Uint8Array;
}
