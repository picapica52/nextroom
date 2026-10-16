// Mastra's voice interface over the engine: speak() is Irodori-TTS (the speech.cpp server) or
// ElevenLabs, and listen() is the speech.cpp server or ElevenLabs Scribe, as the settings choose. The full voice (its files, seed, ...) goes to the engine as it is,
// which an OpenAI-compatible speech API could not carry.

import { Readable } from "node:stream";
import { MastraVoice } from "@mastra/core/voice";
import type { AsrProvider } from "@nextroom/contracts";
import { type SynthesisOutcome, synthesizeSpeech, transcribeSpeech } from "../engine/service";
import { defaultSpeakSettings, type SpeakSettings } from "../engine/voice";
import { loadSettings } from "../settings/chat";

interface IrodoriSpeakOptions {
	/** The voice to speak with; the default voice without it. */
	settings?: SpeakSettings;
	/** Aborting it cancels the engine's job (Cancelled is thrown). */
	signal?: AbortSignal;
}

interface IrodoriListenOptions {
	/** What to recognize with; the chat settings' without it. */
	provider?: AsrProvider;
	signal?: AbortSignal;
}

/** The synthesized WAV as one chunk, with what the engine told about it. */
type SpeechStream = Readable & Omit<SynthesisOutcome, "audio">;

/** All bytes of a stream, such as the WAV from speak(). */
export async function audioOf(input: NodeJS.ReadableStream): Promise<Uint8Array> {
	const chunks: Uint8Array[] = [];
	for await (const chunk of input) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Uint8Array));
	}
	return Buffer.concat(chunks);
}

export class IrodoriVoice extends MastraVoice<unknown, IrodoriSpeakOptions, IrodoriListenOptions> {
	constructor() {
		super({ name: "irodori" });
	}

	/** The synthesized WAV as it is, for callers that want the bytes rather than a stream. */
	synthesize(text: string, options?: IrodoriSpeakOptions): Promise<SynthesisOutcome> {
		return synthesizeSpeech(text, options?.settings ?? defaultSpeakSettings(), options?.signal);
	}

	override async speak(
		input: string | NodeJS.ReadableStream,
		options?: { speaker?: string } & IrodoriSpeakOptions,
	): Promise<SpeechStream> {
		const text = typeof input === "string" ? input : Buffer.from(await audioOf(input)).toString();
		const { audio, ...outcome } = await this.synthesize(text, options);
		return Object.assign(Readable.from([Buffer.from(audio)]), outcome);
	}

	/** Text of a WAV recording; empty if nothing was said. */
	override async listen(
		audio: Uint8Array | NodeJS.ReadableStream,
		options?: IrodoriListenOptions,
	): Promise<string> {
		const wav = audio instanceof Uint8Array ? audio : await audioOf(audio);
		return transcribeSpeech(wav, options?.provider ?? loadSettings().asr_provider, options?.signal);
	}

	override async getListener() {
		return { enabled: true };
	}
}

export const irodoriVoice = new IrodoriVoice();
