// EmbeddingGemma 300m (q8 ONNX), run here on the CPU through Transformers.js, as the embedder the
// observations are searched by meaning with. The model is downloaded on first use.

import { AutoModel, AutoTokenizer } from "@huggingface/transformers";

import { modelCacheDir } from "../../lib/config";

const MODEL = "onnx-community/embeddinggemma-300m-ONNX";
const REVISION = "5090578d9565bb06545b4552f76e6bc2c93e4a66";
/** One prompt for both sides: Mastra embeds the observations and the query with one embedder. */
const PROMPT = "task: sentence similarity | query: ";

async function load() {
	const options = { cache_dir: modelCacheDir(), revision: REVISION };
	const [tokenizer, model] = await Promise.all([
		AutoTokenizer.from_pretrained(MODEL, options),
		AutoModel.from_pretrained(MODEL, { ...options, dtype: "q8" }),
	]);
	return { tokenizer, model };
}

let loaded: ReturnType<typeof load> | null = null;
/** Calls run one at a time: a batch already takes every core. */
let queue: Promise<unknown> = Promise.resolve();

async function run(texts: string[], signal?: AbortSignal): Promise<number[][]> {
	loaded ??= load().catch((error) => {
		loaded = null;
		throw error;
	});
	const { tokenizer, model } = await loaded;
	signal?.throwIfAborted();
	const inputs = tokenizer(
		texts.map((text) => PROMPT + text),
		{ padding: true, truncation: true },
	);
	const { sentence_embedding } = await model(inputs);
	return sentence_embedding.tolist();
}

/** Embeddings in the shape Mastra's embedding calls take (AI SDK v5). */
export const embedder = {
	specificationVersion: "v2" as const,
	provider: "transformers.js",
	modelId: MODEL,
	maxEmbeddingsPerCall: 64,
	supportsParallelCalls: false,
	async doEmbed({ values, abortSignal }: { values: string[]; abortSignal?: AbortSignal }) {
		const result = queue.then(() => run(values, abortSignal));
		queue = result.catch(() => {});
		return { embeddings: await result };
	},
};
