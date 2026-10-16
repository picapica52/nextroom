// ElevenLabs' API: speech (text-to-speech), transcription (Scribe), and the account's voices
// (Instant Voice Clone, Voice Design). Speech comes back as 24 kHz PCM, made into a WAV like the
// engine's.

import type {
	ElevenlabsTtsModel,
	ElevenlabsVoice,
	ElevenlabsVoicePreview,
} from "@nextroom/contracts";

import { encodeWav } from "../engine/wav";
import { elevenlabsApiKey } from "../settings/chat";
import { BadRequestError, Cancelled, ConflictError } from "./errors";

const ELEVENLABS_API_URL = "https://api.elevenlabs.io";
const PCM_RATE = 24000;
/** The speeds ElevenLabs takes. */
const MIN_SPEED = 0.7;
const MAX_SPEED = 1.2;
/** What Voice Design speaks the candidates with (it takes 100–1000 characters). */
const DESIGN_TEXT =
	"こんにちは。今日はいい天気ですね。少し散歩をしてきたのですが、風が気持ちよくて、つい遠くまで歩いてしまいました。" +
	"帰りに小さなお店で温かい飲み物を買って、ベンチに座ってひと休みしました。" +
	"こういう何でもない時間が、けっこう好きなんです。あなたは最近、どんなふうに過ごしていますか？";

function requireKey(): string {
	const key = elevenlabsApiKey();
	if (!key) throw new BadRequestError(".env で ELEVENLABS_API_KEY を設定してください");
	return key;
}

/** ElevenLabs' error detail: a message, `{message}` or a list of `{msg}`. */
function detailOf(answer: unknown): string | null {
	const detail = (answer as { detail?: unknown } | null)?.detail;
	if (typeof detail === "string") return detail;
	if (Array.isArray(detail))
		return detail.map((d) => (d as { msg?: string }).msg ?? JSON.stringify(d)).join(" / ");
	if (detail && typeof detail === "object" && "message" in detail) return String(detail.message);
	return null;
}

/** The response of `path`; a failed request is a ConflictError, an aborted one Cancelled. */
async function request(path: string, init: RequestInit = {}): Promise<Response> {
	const headers = new Headers(init.headers);
	headers.set("xi-api-key", requireKey());
	let response: Response;
	try {
		response = await fetch(ELEVENLABS_API_URL + path, { ...init, headers });
	} catch (error) {
		if (init.signal?.aborted) throw new Cancelled();
		throw new ConflictError(`ElevenLabs に接続できません: ${(error as Error).message}`);
	}
	if (!response.ok) {
		const detail = detailOf(await response.json().catch(() => null));
		throw new ConflictError(`ElevenLabs: ${detail ?? `${response.status} ${response.statusText}`}`);
	}
	return response;
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
	return (await request(path, init)).json() as Promise<T>;
}

const jsonBody = (body: unknown): RequestInit => ({
	method: "POST",
	headers: { "content-type": "application/json" },
	body: JSON.stringify(body),
});

export interface ElevenlabsSpeech {
	voiceId: string;
	model: ElevenlabsTtsModel;
	speed: number;
}

/** `text` spoken by the voice: a 16-bit WAV, its length and the seed. */
export async function synthesizeElevenlabs(
	text: string,
	speech: ElevenlabsSpeech,
	signal?: AbortSignal,
): Promise<{ audio: Uint8Array; duration: number; seed: number }> {
	if (!speech.voiceId)
		throw new BadRequestError("キャラクターの声で ElevenLabs の声を選んでください");
	const speed = Math.min(Math.max(Number(speech.speed) || 1, MIN_SPEED), MAX_SPEED);
	const body: Record<string, unknown> = {
		text,
		model_id: speech.model,
		voice_settings: { speed },
	};
	// Multilingual v2 does not take a language.
	if (speech.model !== "eleven_multilingual_v2") body.language_code = "ja";
	// A seed of its own, so the one used can be told.
	const seed = Math.floor(Math.random() * 4294967295);
	body.seed = seed;
	const response = await request(
		`/v1/text-to-speech/${encodeURIComponent(speech.voiceId)}?output_format=pcm_${PCM_RATE}`,
		{ ...jsonBody(body), signal },
	);
	const pcm = new Uint8Array(await response.arrayBuffer());
	return {
		audio: encodeWav([pcm], PCM_RATE),
		duration: pcm.length / 2 / PCM_RATE,
		seed,
	};
}

/** The text of a recording (Scribe); empty if nothing was said. */
export async function transcribeElevenlabs(audio: Uint8Array, signal?: AbortSignal) {
	const form = new FormData();
	form.append("model_id", "scribe_v2");
	form.append("language_code", "ja");
	form.append("tag_audio_events", "false");
	form.append(
		"file",
		new Blob([audio as Uint8Array<ArrayBuffer>], { type: "audio/wav" }),
		"speech.wav",
	);
	const answer = await requestJson<{ text?: string }>("/v1/speech-to-text", {
		method: "POST",
		body: form,
		signal,
	});
	return (answer.text ?? "").trim();
}

interface VoicesPage {
	voices: {
		voice_id: string;
		name?: string;
		category?: string;
		description?: string | null;
	}[];
	has_more: boolean;
	next_page_token: string | null;
}

/** The account's voices: its own first, then ElevenLabs' own. */
export async function listElevenlabsVoices(): Promise<ElevenlabsVoice[]> {
	const out: ElevenlabsVoice[] = [];
	let token: string | null = null;
	for (let page = 0; page < 10; page++) {
		const query = new URLSearchParams({ page_size: "100" });
		if (token) query.set("next_page_token", token);
		const answer: VoicesPage = await requestJson<VoicesPage>(`/v2/voices?${query}`);
		for (const v of answer.voices)
			out.push({
				voice_id: v.voice_id,
				name: v.name ?? v.voice_id,
				category: v.category ?? "",
				description: v.description ?? null,
			});
		if (!answer.has_more || !answer.next_page_token) break;
		token = answer.next_page_token;
	}
	const premade = (v: ElevenlabsVoice) => (v.category === "premade" ? 1 : 0);
	return out.sort((a, b) => premade(a) - premade(b));
}

/** A voice cloned from recordings (Instant Voice Clone); its id. */
export async function cloneElevenlabsVoice(
	name: string,
	files: { name: string; data: Uint8Array }[],
	removeBackgroundNoise: boolean,
): Promise<string> {
	if (!name.trim()) throw new BadRequestError("名前を入力してください");
	if (!files.length) throw new BadRequestError("音声を選んでください");
	const form = new FormData();
	form.append("name", name.trim());
	form.append("remove_background_noise", String(removeBackgroundNoise));
	for (const file of files)
		form.append("files", new Blob([file.data as Uint8Array<ArrayBuffer>]), file.name);
	const answer = await requestJson<{ voice_id: string }>("/v1/voices/add", {
		method: "POST",
		body: form,
	});
	return answer.voice_id;
}

/** Candidate voices for a description (Voice Design), each speaking a Japanese passage. */
export async function designElevenlabsVoices(
	description: string,
): Promise<ElevenlabsVoicePreview[]> {
	if (!description.trim()) throw new BadRequestError("声の説明を入力してください");
	const answer = await requestJson<{
		previews: {
			generated_voice_id: string;
			audio_base_64: string;
			media_type?: string;
			duration_secs?: number;
		}[];
	}>(
		"/v1/text-to-voice/design?output_format=mp3_44100_128",
		jsonBody({
			voice_description: description.trim(),
			model_id: "eleven_ttv_v3",
			text: DESIGN_TEXT,
		}),
	);
	return answer.previews.map((p) => ({
		generated_voice_id: p.generated_voice_id,
		audio: `data:${p.media_type || "audio/mpeg"};base64,${p.audio_base_64}`,
		duration: p.duration_secs ?? 0,
	}));
}

/** Saves a Voice Design candidate to the account; its id. */
export async function saveElevenlabsVoice(
	name: string,
	description: string,
	generatedVoiceId: string,
): Promise<string> {
	if (!name.trim()) throw new BadRequestError("名前を入力してください");
	const answer = await requestJson<{ voice_id: string }>(
		"/v1/text-to-voice",
		jsonBody({
			voice_name: name.trim(),
			voice_description: description.trim(),
			generated_voice_id: generatedVoiceId,
		}),
	);
	return answer.voice_id;
}

export async function deleteElevenlabsVoice(voiceId: string): Promise<void> {
	await request(`/v1/voices/${encodeURIComponent(voiceId)}`, { method: "DELETE" });
}
