// Discord's voice is 48 kHz 16-bit stereo PCM (as Opus); the recognizers are given 16 kHz mono
// WAV, and the synthesized WAV is played back at Discord's rate.

import { encodeWav, readMono } from "../engine/wav";

export const DISCORD_RATE = 48_000;
const ASR_RATE = 16_000;
const FRAME_BYTES = 4;

/** Seconds of decoded Discord audio. */
export const pcmSeconds = (bytes: number) => bytes / FRAME_BYTES / DISCORD_RATE;

/** What someone said (decoded Discord audio) as a 16 kHz mono WAV. */
export function utteranceWav(pcm: Buffer): Uint8Array {
	const step = DISCORD_RATE / ASR_RATE;
	const frames = Math.floor(pcm.length / FRAME_BYTES / step);
	const out = new Int16Array(frames);
	for (let i = 0; i < frames; i++) {
		let sum = 0;
		for (let k = 0; k < step; k++) {
			const at = (i * step + k) * FRAME_BYTES;
			sum += pcm.readInt16LE(at) + pcm.readInt16LE(at + 2);
		}
		out[i] = Math.round(sum / (step * 2));
	}
	return encodeWav([new Uint8Array(out.buffer)], ASR_RATE);
}

/** A synthesized WAV as Discord's raw PCM, resampled linearly. */
export function playablePcm(wav: Uint8Array): Buffer {
	const { samples, sampleRate } = readMono(wav);
	const ratio = sampleRate / DISCORD_RATE;
	const frames = Math.floor(samples.length / ratio);
	const out = Buffer.alloc(frames * FRAME_BYTES);
	for (let i = 0; i < frames; i++) {
		const pos = i * ratio;
		const at = Math.floor(pos);
		const a = samples[at] ?? 0;
		const b = samples[at + 1] ?? a;
		const x = Math.max(-1, Math.min(1, a + (b - a) * (pos - at)));
		const value = Math.round(x * 32767);
		out.writeInt16LE(value, i * FRAME_BYTES);
		out.writeInt16LE(value, i * FRAME_BYTES + 2);
	}
	return out;
}
