// Background removal with BiRefNet lite, run here on the CPU through Transformers.js. The model is
// downloaded on first use.

import { type BackgroundRemovalPipeline, pipeline, RawImage } from "@huggingface/transformers";

import { modelCacheDir } from "../lib/config";

const MODEL = "onnx-community/BiRefNet_lite-ONNX";
const REVISION = "de15b22ba131738a16dff04aab8bdf8dc32e3ac1";

let remover: Promise<BackgroundRemovalPipeline> | null = null;

function load(): Promise<BackgroundRemovalPipeline> {
	remover ??= pipeline("background-removal", MODEL, {
		cache_dir: modelCacheDir(),
		revision: REVISION,
		dtype: "fp32",
	}).catch((error) => {
		remover = null;
		throw error;
	});
	return remover;
}

/** The image as a PNG with its background made transparent. */
export async function cutout(
	image: Uint8Array<ArrayBuffer>,
	signal?: AbortSignal,
): Promise<Buffer> {
	const remove = await load();
	signal?.throwIfAborted();
	const output = await remove(await RawImage.fromBlob(new Blob([image])));
	return output.toSharp().png().toBuffer();
}
