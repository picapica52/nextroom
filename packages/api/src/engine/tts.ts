// Irodori-TTS on the speech.cpp server, on the character's model (loaded first when the server
// holds another). Voice Clone speaks with a voice file or a reference WAV, which is added to the
// server's model as a voice the first time. Called only from GPU jobs, so
// one thing at a time is sent.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";

import { BadRequestError, Cancelled } from "../lib/errors";
import { addVoice, type ServedModel, servedModel, speechFetch } from "./speech";
import { ensureHeld } from "./speech-models";
import type { SpeakSettings } from "./voice";
import { wavInfo, wavSeconds } from "./wav";

export interface SynthesisOutcome {
	audio: Uint8Array;
	duration: number;
	seed: number;
}

/** The server's name for the voice of `path`: one the server holds, or added now. */
async function voiceOf(held: ServedModel, path: string, signal: AbortSignal): Promise<string> {
	const { mtimeMs, size } = statSync(path);
	const name = `v_${createHash("sha1").update(`${path}|${mtimeMs}|${size}`).digest("hex").slice(0, 16)}`;
	if (!held.speech.voices.some((v) => v.name === name))
		await addVoice(name, readFileSync(path), signal);
	return name;
}

const isMeanflow = (held: ServedModel) => /\bMF\b|meanflow/i.test(held.speech.name ?? held.id);

/** MeanFlow speaks with 4 steps unless told; the app gives it more. */
const MEANFLOW_STEPS = 12;

/** Speak `text` with `settings`: a 16-bit WAV at the model's rate, its length and its seed. */
export async function synthesize(
	text: string,
	settings: SpeakSettings,
	signal: AbortSignal,
): Promise<SynthesisOutcome> {
	if (!settings.irodori_model)
		throw new BadRequestError("キャラクターの音声合成モデルを選んでください");
	await ensureHeld(settings.irodori_model, signal);
	const held = await servedModel("synthesis", signal);
	if (!settings.clone_file || !existsSync(settings.clone_file))
		throw new BadRequestError("Voice Clone にはボイスファイルが必要です");
	const voice = await voiceOf(held, settings.clone_file, signal);
	const request: Record<string, unknown> = {
		input: text,
		voice,
		speed: Math.min(Math.max(Number(settings.speed) || 1, 0.5), 2),
		response_format: "wav",
	};
	if (isMeanflow(held) && !("steps" in held.defaults)) request.steps = MEANFLOW_STEPS;
	const caption = settings.caption.trim();
	if (caption) request.instructions = caption;
	const response = await speechFetch(
		"音声を合成できません",
		"/v1/audio/speech",
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(request),
		},
		signal,
	);
	const audio = new Uint8Array(
		await response.arrayBuffer().catch((error) => {
			throw signal.aborted ? new Cancelled() : error;
		}),
	);
	return {
		audio,
		duration: wavSeconds(wavInfo(audio)),
		seed: Number(response.headers.get("x-speech-seed")) || 0,
	};
}
