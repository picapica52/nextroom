// The speech.cpp server (`speech serve`) the user starts, over HTTP (its docs/server.md): OpenAI's
// audio endpoints, the models it holds, and /speech/voices of its page, which adds a voice made
// from a recording or a voice file to the synthesis model. The server holds one model of each
// task and answers one request at a time for each; a request whose fetch is aborted is stopped
// there too.

import type { SpeechServerStatus } from "@nextroom/contracts";
import { z } from "zod";

import { BadRequestError, Cancelled, ConflictError, messageOf } from "../lib/errors";
import { speechUrl } from "../settings/chat";

const errorBodySchema = z.looseObject({
	error: z.looseObject({
		message: z.string().optional(),
		param: z.string().nullish(),
		code: z.string().nullish(),
	}),
});

/** A request the server refused (400): `param` names the input at fault. */
export class SpeechRefused extends BadRequestError {
	constructor(
		message: string,
		readonly param: string | null,
		readonly code: string | null,
	) {
		super(message);
	}
}

async function failure(what: string, response: Response): Promise<Error> {
	const parsed = errorBodySchema.safeParse(await response.json().catch(() => null));
	const error = parsed.success ? parsed.data.error : null;
	const param = error?.param ?? null;
	const message = `${what}: ${error?.message ?? `speech.cpp サーバーが ${response.status} を返しました`}${param ? `（${param}）` : ""}`;
	if (response.status === 400) return new SpeechRefused(message, param, error?.code ?? null);
	if (response.status === 503)
		return new ConflictError(`${what}: speech.cpp がモデルを読み込み中です`);
	return new ConflictError(message);
}

/** `path` of the server, answered with a 2xx; otherwise the error it gave, after `what`. */
export async function speechFetch(
	what: string,
	path: string,
	init: RequestInit = {},
	signal?: AbortSignal,
): Promise<Response> {
	const url = speechUrl();
	let response: Response;
	try {
		response = await fetch(`${url}${path}`, { ...init, signal });
	} catch (error) {
		if (signal?.aborted) throw new Cancelled();
		throw new ConflictError(
			`${what}: speech.cpp サーバー（${url}）に接続できません。speech serve を起動してください（${messageOf(error)}）`,
		);
	}
	if (!response.ok) throw await failure(what, response);
	return response;
}

const extra = z.number().optional().catch(undefined);

const modelSchema = z.looseObject({
	id: z.string(),
	defaults: z.record(z.string(), z.unknown()).catch({}),
	speech: z.looseObject({
		name: z.string().optional(),
		task: z.string(),
		sample_rate: extra,
		voices: z.array(z.looseObject({ name: z.string() })).catch([]),
		options: z
			.array(z.looseObject({ name: z.string(), default: z.unknown().optional() }))
			.catch([]),
	}),
});
export type ServedModel = z.infer<typeof modelSchema>;

const modelsSchema = z.looseObject({ data: z.array(z.unknown()) });

/** The models the server holds, by task (synthesis, recognition, detection). */
export async function servedModels(
	signal?: AbortSignal,
): Promise<Partial<Record<string, ServedModel>>> {
	const response = await speechFetch(
		"speech.cpp のモデルを確認できません",
		"/v1/models",
		{},
		signal,
	);
	const { data } = modelsSchema.parse(await response.json());
	const out: Partial<Record<string, ServedModel>> = {};
	for (const item of data) {
		const parsed = modelSchema.safeParse(item);
		if (parsed.success) out[parsed.data.speech.task] = parsed.data;
	}
	return out;
}

/** The server's model of `task`; ConflictError if it holds none. */
export async function servedModel(
	task: "synthesis" | "recognition",
	signal?: AbortSignal,
): Promise<ServedModel> {
	const model = (await servedModels(signal))[task];
	if (!model) {
		const what = task === "synthesis" ? "音声合成" : "文字起こし";
		throw new ConflictError(
			`speech.cpp サーバーに${what}のモデルがありません。speech serve にモデルを渡して起動してください`,
		);
	}
	return model;
}

/** Add the voice `name` to the synthesis model from `data`, a WAVE recording or a voice file
 *  (the server tells them apart by their bytes). */
export async function addVoice(
	name: string,
	data: Uint8Array,
	signal?: AbortSignal,
): Promise<void> {
	const form = new FormData();
	form.append("name", name);
	form.append("file", new Blob([data as Uint8Array<ArrayBuffer>]), "voice.wav");
	try {
		await speechFetch(
			"声を speech.cpp に追加できません",
			"/speech/voices",
			{ method: "POST", body: form },
			signal,
		);
	} catch (error) {
		// Added meanwhile, by an earlier request that was cut off.
		if (error instanceof SpeechRefused && error.param === "name") return;
		if (error instanceof ConflictError && /page_off|is on only while/.test(error.message))
			throw new ConflictError(
				"speech.cpp サーバーに声を追加できません。サーバーを 127.0.0.1 で待ち受けるように起動してください（--host を付けない）",
			);
		throw error;
	}
}

/** What the server says it holds, for the status; fetched at most every couple of seconds. */
let cached: { at: number; status: SpeechServerStatus } | null = null;

/** The server's models changed: the next status asks again. */
export const forgetStatus = () => {
	cached = null;
};

export async function speechStatus(): Promise<SpeechServerStatus> {
	const url = speechUrl();
	if (cached && cached.status.url === url && Date.now() - cached.at < 1500) return cached.status;
	let status: SpeechServerStatus;
	try {
		const models = await servedModels(AbortSignal.timeout(1500));
		const name = (m: ServedModel | undefined) => (m ? (m.speech.name ?? m.id) : null);
		status = {
			url,
			ok: true,
			error: null,
			tts: name(models.synthesis),
			asr: name(models.recognition),
		};
	} catch (error) {
		status = { url, ok: false, error: messageOf(error), tts: null, asr: null };
	}
	cached = { at: Date.now(), status };
	return status;
}
