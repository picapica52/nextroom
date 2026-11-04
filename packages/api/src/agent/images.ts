// Image models through pi, the same way as the replies' models: any provider pi gives image models
// to, signed in to on the connections screen. The photos the characters send are drawn with the
// image model of the chat settings.

import type { ImageContent } from "@earendil-works/pi-ai";
import type { ImageProviderStatus, LlmProvider } from "@nextroom/contracts";
import sharp from "sharp";

import { BadRequestError, ConflictError } from "../lib/errors";
import { loadSettings } from "../settings/chat";
import type { LlmModel } from "./models";
import { piModels, providerName } from "./providers";

const LIST_TIMEOUT_MS = 30_000;
/** A reference is sent no larger than this on its longer side. */
const REFERENCE_SIZE = 1024;

/** pi's providers that have image models, and whether each can be used now. */
export async function imageProviders(): Promise<ImageProviderStatus[]> {
	const models = piModels();
	const ids = models
		.getProviders()
		.filter((p) => models.getModelsOfType("image", p.id).length > 0)
		.map((p) => p.id)
		.sort((a, b) => a.localeCompare(b));
	return Promise.all(
		ids.map(async (id) => ({
			id,
			name: providerName(id),
			configured: Boolean(await models.checkAuth(id).catch(() => undefined)),
		})),
	);
}

/** The image models of `provider` that can be used now, brought up to date when it can be. */
export async function listImageModels(provider: LlmProvider): Promise<LlmModel[]> {
	const models = piModels();
	if (!(await models.checkAuth(provider).catch(() => undefined)))
		throw new BadRequestError(`設定 → 接続 で ${providerName(provider)} を設定してください`);
	await models
		.refresh({ providers: [provider], signal: AbortSignal.timeout(LIST_TIMEOUT_MS) })
		.catch((error) => console.warn(`Could not refresh the models of ${provider}:`, error));
	return (await models.getAvailableOfType("image", provider))
		.map((m) => ({
			id: m.id,
			name: m.name || m.id,
			...(m.cost.input > 0 || m.cost.output > 0
				? { price: { input: m.cost.input, output: m.cost.output } }
				: {}),
		}))
		.sort((a, b) => a.id.localeCompare(b.id));
}

/** Transparent parts become white: models draw whatever color a cutout's hidden pixels have. */
async function referenceOf(image: Uint8Array): Promise<ImageContent> {
	const png = await sharp(image)
		.flatten({ background: "#ffffff" })
		.resize(REFERENCE_SIZE, REFERENCE_SIZE, { fit: "inside", withoutEnlargement: true })
		.png()
		.toBuffer();
	return { type: "image", data: png.toString("base64"), mimeType: "image/png" };
}

/** The images the chosen image model drew from `prompt` and the references, as it gave them. */
export async function drawImages(
	prompt: string,
	references: Uint8Array[],
	signal?: AbortSignal,
): Promise<Uint8Array[]> {
	const choice = loadSettings().image_model;
	if (!choice) throw new BadRequestError("設定 → モデル で 画像の生成 のモデルを選んでください");
	const models = piModels();
	const model = models.getModelOfType("image", choice.provider, choice.model);
	if (!model)
		throw new BadRequestError(
			`${providerName(choice.provider)} の画像モデル ${choice.model} が見つかりません。設定 → モデル で選び直してください`,
		);
	const input = [
		{ type: "text" as const, text: prompt },
		...(model.input.includes("image") ? await Promise.all(references.map(referenceOf)) : []),
	];
	const result = await models.generateImages(model, { input }, { signal });
	if (result.stopReason === "aborted") throw signal?.reason ?? new Error("中断されました");
	if (result.stopReason === "error")
		throw new ConflictError(
			`${providerName(choice.provider)}: ${result.errorMessage ?? "画像を生成できませんでした"}`,
		);
	const images = result.output.flatMap((c) =>
		c.type === "image" ? [new Uint8Array(Buffer.from(c.data, "base64"))] : [],
	);
	if (!images.length)
		throw new ConflictError(`${providerName(choice.provider)} から画像が返りませんでした`);
	return images;
}
