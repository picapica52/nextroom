// Transcription with the speech.cpp server's recognition model, the settings' when one is chosen.
// A recognizer given several sentences at once drops some, so long audio is cut at pauses and
// the pieces' texts joined.

import { z } from "zod";

import { loadSettings } from "../settings/chat";
import { servedModel, speechFetch } from "./speech";
import { ensureHeld } from "./speech-models";
import { encodeWav, readMono, splitAtPauses, toInt16 } from "./wav";

const resultSchema = z.looseObject({ text: z.string().catch("") });

/** The text of a WAV recording; empty if nothing was said. */
export async function transcribe(wav: Uint8Array, signal: AbortSignal): Promise<string> {
	const { samples, sampleRate } = readMono(wav);
	const model = loadSettings().asr_model;
	if (model) await ensureHeld(model, signal);
	else await servedModel("recognition", signal);
	const texts: string[] = [];
	for (const [start, end] of splitAtPauses(samples, sampleRate)) {
		const pcm = toInt16(samples.subarray(start, end));
		const form = new FormData();
		const audio = encodeWav([new Uint8Array(pcm.buffer)], sampleRate);
		form.append("file", new Blob([audio as Uint8Array<ArrayBuffer>]), "audio.wav");
		const response = await speechFetch(
			"文字起こしできません",
			"/v1/audio/transcriptions",
			{ method: "POST", body: form },
			signal,
		);
		texts.push(resultSchema.parse(await response.json()).text.trim());
	}
	return texts.join("").trim();
}
