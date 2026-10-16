// The models of the speech.cpp server's catalog that the app offers: the Irodori-TTS family, and
// every recognition model whose languages include Japanese. The server fetches one
// into its own model folder and loads it in place of its task's (POST /speech/load, a stream of
// server-sent events); cutting the request stops the fetch, which the next load resumes. Like
// /speech/voices, these endpoints are open only while the server listens on 127.0.0.1. Each
// character speaks with its own Irodori-TTS model, and transcription with the settings' model,
// which each loads first when the server holds another.

import type { SpeechModel, SpeechModels } from "@nextroom/contracts";
import { z } from "zod";

import { BadRequestError, Cancelled, ConflictError, messageOf } from "../lib/errors";
import { forgetStatus, speechFetch } from "./speech";

/** The Irodori-TTS family, which speaks with the voice files the app makes. */
const isIrodori = (name: string) => /^irodori-tts(-|$)/.test(name);

/** A model as the catalog describes it: its languages and its file's weight type. */
const describe = (name: string, languages: string[], type: string | undefined) =>
	[
		languages.length > 1 ? `日本語を含む ${languages.length} 言語` : "日本語専用",
		type ? `（${type.toUpperCase()}）` : "",
		/-mf$/.test(name) ? "・MeanFlow 蒸留版で速い" : "",
	].join("");

/** "owner/Irodori-TTS-v4.1-Small-GGUF" → "Irodori-TTS-v4.1-Small". */
const labelOf = (repository: string | undefined, name: string) =>
	repository
		?.split("/")
		.at(-1)
		?.replace(/-GGUF$/i, "") || name;

const fileSchema = z.looseObject({
	type: z.string(),
	file: z.string(),
	size: z.number(),
	fetched: z.boolean(),
	partial: z.number().catch(0),
});
const catalogModelSchema = z.looseObject({
	name: z.string(),
	task: z.string(),
	type: z.string().optional(),
	repository: z.string().optional().catch(undefined),
	languages: z.array(z.string()).optional().catch(undefined),
	start: z.array(z.string()).catch([]),
	files: z.array(fileSchema),
});
const taskSchema = z
	.looseObject({
		held: z.looseObject({ name: z.string().nullish(), path: z.string().nullish() }).nullable(),
	})
	.optional()
	.catch(undefined);
const stateSchema = z.looseObject({
	catalog: z.looseObject({ models: z.array(z.unknown()) }),
	synthesis: taskSchema,
	recognition: taskSchema,
});

const eventSchema = z.looseObject({
	type: z.string(),
	done: z.number().optional(),
	total: z.number().optional(),
	error: z.looseObject({ message: z.string().optional() }).optional(),
});

interface Load {
	phase: "fetching" | "loading" | "failed";
	done: number;
	total: number;
	error: string | null;
	controller: AbortController;
}

/** By the model's name in the catalog. */
const loads = new Map<string, Load>();

const nameOf = (name: string): string => {
	if (!name.trim()) throw new BadRequestError("モデルの名前がありません");
	return name;
};

/** The objects of a stream of server-sent events, each from its "data:" lines. */
async function* events(body: ReadableStream<Uint8Array>) {
	const decoder = new TextDecoder();
	let buffer = "";
	for await (const chunk of body) {
		buffer += decoder.decode(chunk, { stream: true });
		for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) {
			const data = buffer
				.slice(0, end)
				.split("\n")
				.filter((line) => line.startsWith("data: "))
				.map((line) => line.slice(6))
				.join("\n");
			buffer = buffer.slice(end + 2);
			if (data) yield eventSchema.parse(JSON.parse(data));
		}
	}
}

async function run(name: string, load: Load): Promise<void> {
	const what = `${name} を読み込めません`;
	let response: Response;
	try {
		response = await speechFetch(
			what,
			"/speech/load",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ model: name }),
			},
			load.controller.signal,
		);
	} catch (error) {
		if (error instanceof ConflictError && /page_off|is on only while/.test(error.message))
			throw new ConflictError(
				`${what}: サーバーを 127.0.0.1 で待ち受けるように起動してください（--host を付けない）`,
			);
		throw error;
	}
	if (!response.body) throw new ConflictError(`${what}: speech.cpp サーバーが応答しません`);
	for await (const event of events(response.body)) {
		if (event.type === "fetch") {
			load.phase = "fetching";
			load.done = event.done ?? load.done;
			load.total = event.total ?? load.total;
		} else if (event.type === "load") {
			load.phase = "loading";
		} else if (event.type === "error") {
			throw new ConflictError(`${what}: ${event.error?.message ?? "speech.cpp のエラー"}`);
		}
	}
}

export const speechLoads = {
	start(model: string): void {
		const name = nameOf(model);
		const running = loads.get(name);
		if (running && running.phase !== "failed") return;
		const load: Load = {
			phase: "fetching",
			done: 0,
			total: 0,
			error: null,
			controller: new AbortController(),
		};
		loads.set(name, load);
		run(name, load).then(
			() => {
				loads.delete(name);
				forgetStatus();
			},
			(error) => {
				if (load.controller.signal.aborted) {
					loads.delete(name);
					return;
				}
				load.phase = "failed";
				load.error = messageOf(error);
			},
		);
	},

	cancel(model: string): void {
		loads.get(nameOf(model))?.controller.abort();
	},
};

const fileName = (path: string) => path.split(/[\\/]/).at(-1);

/** The offered models as the server's catalog lists them, with the loads the app started. */
export async function speechModels(): Promise<SpeechModels> {
	let state: z.infer<typeof stateSchema>;
	try {
		const response = await speechFetch(
			"speech.cpp のモデルを確認できません",
			"/speech/models",
			{},
			AbortSignal.timeout(3000),
		);
		state = stateSchema.parse(await response.json());
	} catch (error) {
		return { ok: false, error: messageOf(error), models: [] };
	}
	const models: SpeechModel[] = [];
	for (const item of state.catalog.models) {
		const parsed = catalogModelSchema.safeParse(item);
		if (!parsed.success) continue;
		const entry = parsed.data;
		const { name, task } = entry;
		if (task !== "synthesis" && task !== "recognition") continue;
		const offered =
			task === "synthesis" ? isIrodori(name) : !entry.languages || entry.languages.includes("ja");
		if (!offered) continue;
		const file = entry.files.find((f) => f.type === entry.type) ?? entry.files[0];
		if (!file) continue;
		const held = state[task]?.held;
		const load = loads.get(name);
		models.push({
			name,
			label: labelOf(entry.repository, name),
			description: describe(name, entry.languages ?? ["ja"], entry.type),
			recommended: entry.start.includes("ja"),
			task,
			size: file.size,
			fetched_bytes:
				load?.phase === "fetching" && load.done
					? load.done
					: file.fetched
						? file.size
						: file.partial,
			fetched: file.fetched,
			held: !!held && (held.name === name || fileName(held.path ?? "") === file.file),
			loading: load && load.phase !== "failed" ? load.phase : null,
			error: load?.error ?? null,
		});
	}
	return { ok: true, error: null, models };
}

/** Have the server hold `name`, loading it (and waiting) when it holds another. Only a model the
 *  server has fetched is loaded here; fetching one is the user's choice. */
export async function ensureHeld(name: string, signal: AbortSignal): Promise<void> {
	const label = name;
	const { ok, error, models } = await speechModels();
	if (!ok) throw new ConflictError(error ?? "speech.cpp のモデルを確認できません");
	const model = models.find((m) => m.name === name);
	if (!model) throw new ConflictError(`speech.cpp のカタログに ${label} がありません`);
	if (model.held) return;
	const where =
		model.task === "recognition" ? "「設定 → モデル」の Speech To Text" : "キャラクターの声の画面";
	if (model.loading)
		throw new ConflictError(`${label} はダウンロード中です。終わってからもう一度試してください`);
	if (!model.fetched)
		throw new ConflictError(
			`${label} がダウンロードされていません。${where}でダウンロードしてください`,
		);
	const load: Load = {
		phase: "loading",
		done: 0,
		total: 0,
		error: null,
		controller: new AbortController(),
	};
	const abort = () => load.controller.abort();
	signal.addEventListener("abort", abort, { once: true });
	loads.set(name, load);
	try {
		await run(name, load);
	} catch (error) {
		if (signal.aborted) throw new Cancelled();
		throw error;
	} finally {
		signal.removeEventListener("abort", abort);
		loads.delete(name);
		forgetStatus();
	}
}
