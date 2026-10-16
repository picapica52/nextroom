// The engine as the rest of the server uses it: speech synthesis and transcription on the
// speech.cpp server (or ElevenLabs, which needs no GPU job), each a job on the GPU queue. Aborting
// `signal` cancels the job (and the server's request with it) and Cancelled is thrown.

import type { AsrProvider } from "@nextroom/contracts";
import { synthesizeElevenlabs, transcribeElevenlabs } from "../lib/elevenlabs";
import { BadRequestError } from "../lib/errors";
import { transcribe } from "./asr";
import { runOnGpu } from "./queue";
import { type SynthesisOutcome, synthesize } from "./tts";
import type { SpeakSettings } from "./voice";

export type { SynthesisOutcome };

export function synthesizeSpeech(
	text: string,
	settings: SpeakSettings,
	signal?: AbortSignal,
): Promise<SynthesisOutcome> {
	const trimmed = text.trim();
	if (settings.provider === "elevenlabs") {
		const model = settings.elevenlabs_model;
		if (!model) throw new BadRequestError("キャラクターの音声合成モデルを選んでください");
		return synthesizeElevenlabs(
			trimmed,
			{
				voiceId: settings.elevenlabs_voice_id,
				model,
				speed: settings.speed,
			},
			signal,
		);
	}
	return runOnGpu(
		"synthesize",
		`音声合成: ${trimmed.slice(0, 20)}`,
		(job) => synthesize(trimmed, settings, job.signal),
		signal,
	);
}

/** The text of a WAV recording; empty if nothing was said. */
export function transcribeSpeech(
	wav: Uint8Array,
	provider: AsrProvider,
	signal?: AbortSignal,
): Promise<string> {
	if (provider === "elevenlabs") return transcribeElevenlabs(wav, signal);
	return runOnGpu("transcribe", "文字起こし", (job) => transcribe(wav, job.signal), signal);
}
