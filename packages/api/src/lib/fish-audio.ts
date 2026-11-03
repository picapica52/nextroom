// Fish Audio's API: speech (text-to-speech), transcription, and the voices (models) it speaks with, the account's
// own ones cloned from recordings and those shared on Fish Audio. Speech comes back as 24 kHz PCM,
// made into a WAV like the engine's.

import type { FishAudioTtsModel, FishAudioVoice } from "@nextroom/contracts";

import { encodeWav } from "../engine/wav";
import { fishAudioApiKey } from "../settings/chat";
import { BadRequestError, Cancelled, ConflictError } from "./errors";

const FISH_AUDIO_API_URL = "https://api.fish.audio";
const PCM_RATE = 24000;
const FISH_AUDIO_ASR_MODEL = "transcribe-1-pro";
/** The speeds Fish Audio takes. */
const MIN_SPEED = 0.5;
const MAX_SPEED = 2;

function requireKey(): string {
	const key = fishAudioApiKey();
	if (!key) throw new BadRequestError("設定 → 音声 で Fish Audio の API キーを入力してください");
	return key;
}

/** Fish Audio's error: `{message}`, or `{detail}` (a message or a list of `{msg}`). */
function detailOf(answer: unknown): string | null {
	const a = answer as { message?: unknown; detail?: unknown } | null;
	if (typeof a?.message === "string" && a.message) return a.message;
	if (typeof a?.detail === "string") return a.detail;
	if (Array.isArray(a?.detail))
		return a.detail.map((d) => (d as { msg?: string }).msg ?? JSON.stringify(d)).join(" / ");
	return null;
}

/** The response of `path`; a failed request is a ConflictError, an aborted one Cancelled. */
async function request(path: string, init: RequestInit = {}): Promise<Response> {
	const headers = new Headers(init.headers);
	headers.set("authorization", `Bearer ${requireKey()}`);
	let response: Response;
	try {
		response = await fetch(FISH_AUDIO_API_URL + path, { ...init, headers });
	} catch (error) {
		if (init.signal?.aborted) throw new Cancelled();
		throw new ConflictError(`Fish Audio に接続できません: ${(error as Error).message}`);
	}
	if (!response.ok) {
		const detail = detailOf(await response.json().catch(() => null));
		throw new ConflictError(`Fish Audio: ${detail ?? `${response.status} ${response.statusText}`}`);
	}
	return response;
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
	return (await request(path, init)).json() as Promise<T>;
}

export interface FishAudioSpeech {
	voiceId: string;
	model: FishAudioTtsModel;
	speed: number;
}

/** `text` spoken by the voice: a 16-bit WAV, its length and the seed (Fish Audio takes none). */
export async function synthesizeFishAudio(
	text: string,
	speech: FishAudioSpeech,
	signal?: AbortSignal,
): Promise<{ audio: Uint8Array; duration: number; seed: number }> {
	if (!speech.voiceId)
		throw new BadRequestError("キャラクターの声で Fish Audio の声を選んでください");
	const speed = Math.min(Math.max(Number(speech.speed) || 1, MIN_SPEED), MAX_SPEED);
	const response = await request("/v1/tts", {
		method: "POST",
		headers: { "content-type": "application/json", model: speech.model },
		body: JSON.stringify({
			text,
			reference_id: speech.voiceId,
			format: "pcm",
			sample_rate: PCM_RATE,
			language: "ja",
			prosody: { speed },
		}),
		signal,
	});
	const pcm = new Uint8Array(await response.arrayBuffer());
	return {
		audio: encodeWav([pcm], PCM_RATE),
		duration: pcm.length / 2 / PCM_RATE,
		seed: 0,
	};
}

interface ModelItem {
	_id: string;
	title?: string;
	description?: string | null;
	state?: string;
	languages?: string[];
	type?: string;
}

const voiceOf = (m: ModelItem, mine: boolean): FishAudioVoice => ({
	id: m._id,
	title: m.title || m._id,
	description: m.description || null,
	mine,
	state: m.state ?? "trained",
	languages: m.languages ?? [],
});

/** The account's own voices. */
export async function listFishAudioVoices(): Promise<FishAudioVoice[]> {
	const out: FishAudioVoice[] = [];
	for (let page = 1; page <= 10; page++) {
		const query = new URLSearchParams({
			self: "true",
			page_size: "100",
			page_number: String(page),
			sort_by: "created_at",
		});
		const answer = await requestJson<{ items: ModelItem[]; has_more?: boolean | null }>(
			`/model?${query}`,
		);
		out.push(...answer.items.filter((m) => m.type !== "svc").map((m) => voiceOf(m, true)));
		if (!answer.has_more || answer.items.length < 100) break;
	}
	return out;
}

/** Voices shared on Fish Audio whose title has `title`, Japanese ones first by popularity. */
export async function searchFishAudioVoices(title: string): Promise<FishAudioVoice[]> {
	const query = new URLSearchParams({ page_size: "30", language: "ja", sort_by: "score" });
	if (title.trim()) query.set("title", title.trim());
	const answer = await requestJson<{ items: ModelItem[] }>(`/model?${query}`);
	return answer.items.filter((m) => m.type !== "svc").map((m) => voiceOf(m, false));
}

/** One voice, by its id (an id copied from a voice's page on Fish Audio works too); whether it is
 *  the account's own is told by listFishAudioVoices(). */
export async function getFishAudioVoice(id: string): Promise<FishAudioVoice> {
	return voiceOf(await requestJson<ModelItem>(`/model/${encodeURIComponent(id)}`), false);
}

/** A voice cloned from recordings, with their transcripts when every one has one; its id. */
export async function cloneFishAudioVoice(
	title: string,
	files: { name: string; data: Uint8Array; text: string | null }[],
	enhanceAudioQuality: boolean,
): Promise<string> {
	if (!title.trim()) throw new BadRequestError("名前を入力してください");
	if (!files.length) throw new BadRequestError("音声を選んでください");
	if (files.length > 20) throw new BadRequestError("Fish Audio に送れる参照音声は20件までです");
	const form = new FormData();
	form.append("type", "tts");
	form.append("train_mode", "fast");
	form.append("visibility", "private");
	form.append("title", title.trim());
	form.append("enhance_audio_quality", String(enhanceAudioQuality));
	for (const file of files)
		form.append(
			"voices",
			new Blob([file.data as Uint8Array<ArrayBuffer>], { type: "audio/wav" }),
			file.name,
		);
	if (files.every((f) => f.text?.trim()))
		for (const file of files) form.append("texts", file.text?.trim() ?? "");
	const answer = await requestJson<{ _id: string }>("/model", { method: "POST", body: form });
	return answer._id;
}

/** The text of a recording; empty if nothing was said. */
export async function transcribeFishAudio(audio: Uint8Array, signal?: AbortSignal) {
	const form = new FormData();
	form.append("language", "ja");
	form.append("ignore_timestamps", "true");
	form.append(
		"audio",
		new Blob([audio as Uint8Array<ArrayBuffer>], { type: "audio/wav" }),
		"speech.wav",
	);
	const answer = await requestJson<{ text?: string }>("/v1/asr", {
		method: "POST",
		headers: { model: FISH_AUDIO_ASR_MODEL },
		body: form,
		signal,
	});
	return (answer.text ?? "").trim();
}

export async function deleteFishAudioVoice(id: string): Promise<void> {
	await request(`/model/${encodeURIComponent(id)}`, { method: "DELETE" });
}
