// Voice settings a sentence is synthesized with.

import {
	type CharacterVoice,
	DEFAULT_CHARACTER_VOICE,
	type VoiceSettings,
} from "@nextroom/contracts";

export type { CharacterVoice, VoiceSettings } from "@nextroom/contracts";

export const defaultCharacterVoice = (): CharacterVoice => ({ ...DEFAULT_CHARACTER_VOICE });

/** `base` with the known fields of `patch` laid over it. */
export function withVoice<T extends CharacterVoice>(base: T, patch: unknown): T {
	const out = { ...base } as Record<string, unknown>;
	if (patch && typeof patch === "object") {
		for (const [key, value] of Object.entries(patch)) {
			if (key in base) out[key] = structuredClone(value);
		}
	}
	return out as unknown as T;
}

/** The files a voice speaks with (absolute paths); null where the voice needs none. */
export interface VoiceFiles {
	/** Voice Clone: the voice file (a WAV or a speech.cpp `.voice.gguf`). */
	clone_file: string | null;
}

export const NO_VOICE_FILES: Readonly<VoiceFiles> = {
	clone_file: null,
};

/** What a line is spoken with: the voice and its files. */
export type SpeakSettings = VoiceSettings & VoiceFiles;

export const defaultSpeakSettings = (): SpeakSettings => ({
	...DEFAULT_CHARACTER_VOICE,
	...NO_VOICE_FILES,
});
