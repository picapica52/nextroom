// Voice settings: what a character keeps and the files a character's voice is spoken with.

import { z } from "zod";

/** irodori: Irodori-TTS on the speech.cpp server; elevenlabs: ElevenLabs' API. */
export const TTS_PROVIDERS = ["irodori", "elevenlabs"] as const;
/** ElevenLabs' models that speak Japanese. */
export const ELEVENLABS_TTS_MODELS = [
	"eleven_v4",
	"eleven_v4_turbo",
	"eleven_v3",
	"eleven_multilingual_v2",
	"eleven_flash_v2_5",
] as const;

export type TtsProvider = (typeof TTS_PROVIDERS)[number];
export type ElevenlabsTtsModel = (typeof ELEVENLABS_TTS_MODELS)[number];

/** How a character's voice sounds and what speaks it. Irodori-TTS always speaks with the Voice
 *  Clone voice file in the character's own folder (CharacterVoiceRefs). */
export const characterVoiceSchema = z.object({
	provider: z.enum(TTS_PROVIDERS).default("irodori"),
	/** Empty: not chosen yet, and the character cannot speak on that provider. */
	/** An Irodori-TTS model of the speech.cpp server's catalog. */
	irodori_model: z.string().default(""),
	elevenlabs_model: z.union([z.enum(ELEVENLABS_TTS_MODELS), z.literal("")]).default(""),
	speed: z.number(),
	caption: z.string(),
	/** The ElevenLabs voice it speaks with when the provider is ElevenLabs. */
	elevenlabs_voice_id: z.string().default(""),
});
export type CharacterVoice = z.infer<typeof characterVoiceSchema>;
export type VoiceSettings = CharacterVoice;

export const DEFAULT_CHARACTER_VOICE: Readonly<CharacterVoice> = {
	provider: "irodori",
	irodori_model: "",
	elevenlabs_model: "",
	speed: 1.0,
	caption: "",
	elevenlabs_voice_id: "",
};

/** The most audio a voice file holds, all clips together. */
export const VOICE_FILE_MAX_SECONDS = 120;

/** The Voice Clone voice file of a character: its reference clips joined into one WAV, or a file
 *  read in as it is (a WAV or a speech.cpp .voice.gguf). */
export const voiceFileInfoSchema = z.object({
	name: z.string(),
	bytes: z.number(),
	created_at: z.number(),
	/** The clips it was made from, in order; null for a file read in. */
	clip_ids: z.array(z.string()).nullable(),
	seconds: z.number().nullable(),
});
export type VoiceFileInfo = z.infer<typeof voiceFileInfoSchema>;

/** One reference clip of a character. */
export interface VoiceRef {
	id: string;
	name: string;
	duration: number | null;
	created_at: number;
	/** Transcript, for reference only (speech.cpp or typed by hand). */
	text: string | null;
	/** The transcript was changed by hand after speech.cpp. */
	edited: boolean;
}

/** A character's reference clips and the voice file Voice Clone speaks with. */
export interface CharacterVoiceRefs {
	clips: VoiceRef[];
	seconds: number;
	voice_file: VoiceFileInfo | null;
	/** ok: made from the clips as they are; stale: clips changed since; file: read in from a file;
	 *  missing: none yet. */
	voice_file_status: "ok" | "stale" | "file" | "missing";
}

/** A voice of the ElevenLabs account. category: premade (ElevenLabs' own), cloned, generated
 *  (Voice Design), professional, ... */
export interface ElevenlabsVoice {
	voice_id: string;
	name: string;
	category: string;
	description: string | null;
}

/** One voice Voice Design made from a description, to hear before saving. */
export interface ElevenlabsVoicePreview {
	generated_voice_id: string;
	/** A data: URL of the audio. */
	audio: string;
	duration: number;
}
