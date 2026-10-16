// WAVE files, the only audio speech.cpp reads: 16-, 24- or 32-bit PCM or 32-bit float.

import { BadRequestError } from "../lib/errors";

interface WavInfo {
	sampleRate: number;
	channels: number;
	bits: number;
	float: boolean;
	/** Where the samples are in the file, and how many bytes. */
	dataOffset: number;
	dataLength: number;
}

const NOT_WAV = "WAV（16 / 24 / 32 bit PCM、32 bit float）の音声を選んでください";

/** The format of a WAVE file; BadRequestError for anything speech.cpp cannot read. */
export function wavInfo(data: Uint8Array): WavInfo {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const tag = (at: number) => String.fromCharCode(...data.subarray(at, at + 4));
	if (data.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE")
		throw new BadRequestError(NOT_WAV);
	let format: Omit<WavInfo, "dataOffset" | "dataLength"> | null = null;
	for (let at = 12; at + 8 <= data.length; ) {
		const id = tag(at);
		const size = view.getUint32(at + 4, true);
		if (id === "fmt ") {
			let code = view.getUint16(at + 8, true);
			// WAVE_FORMAT_EXTENSIBLE names the format in its sub-format GUID.
			if (code === 0xfffe && size >= 40) code = view.getUint16(at + 32, true);
			const bits = view.getUint16(at + 22, true);
			const float = code === 3;
			if (!((code === 1 && [16, 24, 32].includes(bits)) || (float && bits === 32)))
				throw new BadRequestError(NOT_WAV);
			format = {
				channels: view.getUint16(at + 10, true),
				sampleRate: view.getUint32(at + 12, true),
				bits,
				float,
			};
		} else if (id === "data") {
			if (!format) break;
			return { ...format, dataOffset: at + 8, dataLength: Math.min(size, data.length - at - 8) };
		}
		at += 8 + size + (size % 2);
	}
	throw new BadRequestError(NOT_WAV);
}

export const wavSeconds = (info: WavInfo) =>
	info.dataLength / ((info.bits / 8) * info.channels) / info.sampleRate;

/** The samples, channels averaged, as floats in [-1, 1]. */
export function readMono(data: Uint8Array): { samples: Float32Array; sampleRate: number } {
	const info = wavInfo(data);
	const view = new DataView(data.buffer, data.byteOffset + info.dataOffset, info.dataLength);
	const bytes = info.bits / 8;
	const frames = Math.floor(info.dataLength / (bytes * info.channels));
	const samples = new Float32Array(frames);
	for (let i = 0; i < frames; i++) {
		let sum = 0;
		for (let c = 0; c < info.channels; c++) {
			const at = (i * info.channels + c) * bytes;
			if (info.float) sum += view.getFloat32(at, true);
			else if (info.bits === 16) sum += view.getInt16(at, true) / 32768;
			else if (info.bits === 24)
				sum +=
					(view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getInt8(at + 2) << 16)) /
					8388608;
			else sum += view.getInt32(at, true) / 2147483648;
		}
		samples[i] = sum / info.channels;
	}
	return { samples, sampleRate: info.sampleRate };
}

/** Floats in [-1, 1] as 16-bit samples. */
export function toInt16(samples: Float32Array): Int16Array {
	const out = new Int16Array(samples.length);
	for (let i = 0; i < samples.length; i++) {
		const x = Math.max(-1, Math.min(1, samples[i] ?? 0));
		out[i] = Math.round(x * 32767);
	}
	return out;
}

/** A 16-bit mono WAVE file of `pcm`, chunks of little-endian samples in order. */
export function encodeWav(pcm: Uint8Array[], sampleRate: number): Uint8Array {
	const length = pcm.reduce((sum, chunk) => sum + chunk.length, 0);
	const out = new Uint8Array(44 + length);
	const view = new DataView(out.buffer);
	const ascii = (at: number, text: string) => {
		for (let i = 0; i < text.length; i++) out[at + i] = text.charCodeAt(i);
	};
	ascii(0, "RIFF");
	view.setUint32(4, 36 + length, true);
	ascii(8, "WAVE");
	ascii(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	ascii(36, "data");
	view.setUint32(40, length, true);
	let at = 44;
	for (const chunk of pcm) {
		out.set(chunk, at);
		at += chunk.length;
	}
	return out;
}

/** Cut long audio at its quietest pauses, so pieces stay under `maxSeconds`: a recognizer
 *  given several sentences at once drops some. Pieces as [start, end) sample indexes. */
export function splitAtPauses(
	samples: Float32Array,
	sampleRate: number,
	targetSeconds = 10,
	maxSeconds = 20,
): [number, number][] {
	const frame = Math.max(1, Math.floor(sampleRate * 0.02));
	const frames = Math.floor(samples.length / frame);
	if (samples.length <= maxSeconds * sampleRate || frames === 0) return [[0, samples.length]];
	const db = new Float32Array(frames);
	for (let f = 0; f < frames; f++) {
		let sum = 0;
		for (let i = f * frame; i < (f + 1) * frame; i++) sum += (samples[i] ?? 0) ** 2;
		db[f] = 20 * Math.log10(Math.sqrt(sum / frame + 1e-12) + 1e-9);
	}
	const sorted = [...db].sort((a, b) => a - b);
	const threshold = Math.max(
		sorted[Math.floor(frames * 0.2)] ?? -Infinity,
		(sorted.at(-1) ?? 0) - 45,
	);
	const pieces: [number, number][] = [];
	let start = 0;
	while (samples.length - start > maxSeconds * sampleRate) {
		const lo = Math.floor((start + targetSeconds * 0.5 * sampleRate) / frame);
		const hi = Math.min(Math.floor((start + maxSeconds * sampleRate) / frame), frames - 1);
		const target = Math.floor((start + targetSeconds * sampleRate) / frame);
		let cut = -1;
		for (let f = lo; f < hi; f++) {
			if ((db[f] ?? 0) < threshold && (cut < 0 || Math.abs(f - target) < Math.abs(cut - target)))
				cut = f;
		}
		if (cut < 0) {
			cut = lo;
			for (let f = lo; f < hi; f++) if ((db[f] ?? 0) < (db[cut] ?? 0)) cut = f;
		}
		const at = cut * frame + Math.floor(frame / 2);
		pieces.push([start, at]);
		start = at;
	}
	pieces.push([start, samples.length]);
	return pieces;
}

/** `samples` at `to` Hz, resampled linearly. */
function resample(samples: Float32Array, from: number, to: number): Float32Array {
	if (from === to) return samples;
	const ratio = from / to;
	const out = new Float32Array(Math.floor(samples.length / ratio));
	for (let i = 0; i < out.length; i++) {
		const pos = i * ratio;
		const at = Math.floor(pos);
		const a = samples[at] ?? 0;
		out[i] = a + ((samples[at + 1] ?? a) - a) * (pos - at);
	}
	return out;
}

/** The loudness each recording is brought to before they are joined. */
const JOIN_RMS = 0.1;

/** WAVE recordings joined in order into one 16-bit mono WAVE at `sampleRate`, each brought to
 *  the same loudness first (as speech.cpp does with the references of a voice file). */
export function joinWavs(wavs: Uint8Array[], sampleRate: number): Uint8Array {
	const pcm = wavs.map((wav) => {
		const { samples, sampleRate: rate } = readMono(wav);
		const audio = resample(samples, rate, sampleRate);
		let sum = 0;
		let peak = 0;
		for (const x of audio) {
			sum += x * x;
			peak = Math.max(peak, Math.abs(x));
		}
		const rms = Math.sqrt(sum / Math.max(1, audio.length));
		const gain = rms > 1e-4 ? Math.min(JOIN_RMS / rms, 0.99 / Math.max(peak, 1e-4)) : 1;
		for (let i = 0; i < audio.length; i++) audio[i] = (audio[i] ?? 0) * gain;
		const int16 = toInt16(audio);
		return new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
	});
	return encodeWav(pcm, sampleRate);
}
