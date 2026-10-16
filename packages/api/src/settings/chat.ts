// The conversation's settings, under `chat` in _data/settings.json, and the connections (the
// services' addresses and API keys), which are read from the environment (apps/server/.env).

import {
	type CharacterVoice,
	type ChatSettings,
	type ChatSettingsPatch,
	type ChatSettingsView,
	chatSettingsSchema,
	DEFAULT_SPEECH_URL,
} from "@nextroom/contracts";
import { parseOrBadRequest } from "../lib/errors";
import { readSettingsSection, writeSettingsSection } from "./file";

export type { ChatSettings };

const CHAT_DEFAULTS: ChatSettings = {
	provider: "openai_compatible",
	model: "",
	anthropic_model: "",
	openrouter_model: "",
	custom_prompt: "",
	temperature: 0.7,
	max_tokens: null,
	reasoning_effort: "",
	/** {{user}} in the characters' settings. */
	user_name: "ユーザー",
	asr_provider: "parakeet",
	asr_model: "",
	tts_enabled: true,
	image_tag_model: "",
	image_gen_model: "",
};

/** Fields that null clears. */
const NULLABLE = new Set(["max_tokens"]);

/** The saved settings; fields the settings no longer have are left out. */
export function loadSettings(): ChatSettings {
	return { ...CHAT_DEFAULTS, ...readSettingsSection("chat") };
}

/** Settings for the UI: the API keys themselves are never sent back, only whether one is set. */
export function getSettings(): ChatSettingsView {
	return {
		...loadSettings(),
		base_url: openaiCompatibleUrl(),
		speech_url: speechUrl(),
		has_api_key: Boolean(openaiCompatibleApiKey()),
		has_anthropic_api_key: Boolean(anthropicApiKey()),
		has_openrouter_api_key: Boolean(openrouterApiKey()),
		has_exa_api_key: Boolean(exaApiKey()),
		has_composio_api_key: Boolean(composioApiKey()),
		has_elevenlabs_api_key: Boolean(elevenlabsApiKey()),
	};
}

export function updateSettings(patch: ChatSettingsPatch) {
	const current: Record<string, unknown> = { ...loadSettings() };
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined || (value === null && !NULLABLE.has(key))) continue;
		current[key] = value;
	}
	writeSettingsSection("chat", parseOrBadRequest(chatSettingsSchema, current));
	return getSettings();
}

/** Whether replies in `voice` can be spoken: speech is on, and an ElevenLabs voice is chosen when
 *  ElevenLabs speaks. */
export const speaksWith = (voice: CharacterVoice | undefined, s = loadSettings()) =>
	s.tts_enabled && (voice?.provider !== "elevenlabs" || Boolean(voice.elevenlabs_voice_id));

const env = (name: string) => () => process.env[name]?.trim() || "";
const url = (name: string, fallback: string) => () =>
	(process.env[name]?.trim() || fallback).replace(/\/+$/, "");

/** The endpoint of the replies set to "OpenAI compatible". */
export const openaiCompatibleUrl = url("OPENAI_COMPATIBLE_BASE_URL", "http://127.0.0.1:11434/v1");
/** Empty for an endpoint that wants none, such as Ollama. */
export const openaiCompatibleApiKey = env("OPENAI_COMPATIBLE_API_KEY");
export const openrouterApiKey = env("OPENROUTER_API_KEY");
/** Claude Agent SDK uses it too. */
export const anthropicApiKey = env("ANTHROPIC_API_KEY");
/** The character's web search. */
export const exaApiKey = env("EXA_API_KEY");
/** The character's apps. */
export const composioApiKey = env("COMPOSIO_API_KEY");
/** Speech in and out, and the characters' ElevenLabs voices. */
export const elevenlabsApiKey = env("ELEVENLABS_API_KEY");
/** The speech.cpp server, which speaks and transcribes for the local providers. */
export const speechUrl = url("SPEECH_URL", DEFAULT_SPEECH_URL);
