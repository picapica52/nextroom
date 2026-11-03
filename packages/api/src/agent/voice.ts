// The character's voice over the engine: speaking is Irodori-TTS (the speech.cpp server) or
// ElevenLabs, and listening is the speech.cpp server or ElevenLabs Scribe, as the settings choose.
// The full voice (its files, seed, ...) goes to the engine as it is.

import type { AsrProvider } from "@nextroom/contracts";
import { type SynthesisOutcome, synthesizeSpeech, transcribeSpeech } from "../engine/service";
import { defaultSpeakSettings, type SpeakSettings } from "../engine/voice";
import { loadSettings } from "../settings/chat";

interface SpeakOptions {
	/** The voice to speak with; the default voice without it. */
	settings?: SpeakSettings;
	/** Aborting it cancels the engine's job (Cancelled is thrown). */
	signal?: AbortSignal;
}

interface ListenOptions {
	/** What to recognize with; the chat settings' without it. */
	provider?: AsrProvider;
	signal?: AbortSignal;
}

export const irodoriVoice = {
	/** The synthesized WAV, with what the engine told about it. */
	synthesize(text: string, options?: SpeakOptions): Promise<SynthesisOutcome> {
		return synthesizeSpeech(text, options?.settings ?? defaultSpeakSettings(), options?.signal);
	},

	/** Text of a WAV recording; empty if nothing was said. */
	listen(wav: Uint8Array, options?: ListenOptions): Promise<string> {
		return transcribeSpeech(wav, options?.provider ?? loadSettings().asr_provider, options?.signal);
	},
};
