// The conversation's settings, under `chat` in the settings (settings/file.ts), and the connections
// (the services' addresses and API keys), under `connections`: entered on the settings screens,
// with the environment (apps/server/.env) as the fallback for those left empty.

import {
	type CharacterVoice,
	type ChatSettings,
	type ChatSettingsPatch,
	type ChatSettingsView,
	CONNECTION_KEYS,
	CONNECTION_URLS,
	type ConnectionKey,
	type ConnectionSource,
	type ConnectionsPatch,
	type ConnectionsView,
	type ConnectionUrl,
	chatSettingsSchema,
	DEFAULT_SPEECH_URL,
} from "@nextroom/contracts";
import { parseOrBadRequest } from "../lib/errors";
import { readSettingsSection, writeSettingsSection } from "./file";

export type { ChatSettings };

const CHAT_DEFAULTS: ChatSettings = {
	main_model: null,
	image_model: null,
	custom_prompt: "",
	temperature: 0.7,
	max_tokens: null,
	/** {{user}} in the characters' settings. */
	user_name: "ユーザー",
	asr_provider: "parakeet",
	asr_model: "",
	tts_enabled: true,
};

/** The saved settings; fields the settings no longer have are left out. */
export function loadSettings(): ChatSettings {
	return { ...CHAT_DEFAULTS, ...readSettingsSection("chat") };
}

export const getSettings = (): ChatSettingsView => loadSettings();

export function updateSettings(patch: ChatSettingsPatch) {
	const current = { ...loadSettings(), ...patch };
	writeSettingsSection("chat", parseOrBadRequest(chatSettingsSchema, current));
	return getSettings();
}

/** Whether replies in `voice` can be spoken: speech is on, and an ElevenLabs voice is chosen when
 *  ElevenLabs speaks. */
export const speaksWith = (voice: CharacterVoice | undefined, s = loadSettings()) =>
	s.tts_enabled &&
	(voice?.provider === "elevenlabs"
		? Boolean(voice.elevenlabs_voice_id)
		: voice?.provider === "fish_audio"
			? Boolean(voice.fish_audio_voice_id)
			: true);

/** Each connection's variable in the environment, and the default of the addresses. */
const ENV_NAMES: Record<ConnectionKey | ConnectionUrl, string> = {
	openai_compatible_key: "OPENAI_COMPATIBLE_API_KEY",
	exa_key: "EXA_API_KEY",
	composio_key: "COMPOSIO_API_KEY",
	elevenlabs_key: "ELEVENLABS_API_KEY",
	fish_audio_key: "FISH_AUDIO_API_KEY",
	openai_compatible_url: "OPENAI_COMPATIBLE_BASE_URL",
	speech_url: "SPEECH_URL",
};
const URL_DEFAULTS: Record<ConnectionUrl, string> = {
	openai_compatible_url: "http://127.0.0.1:11434/v1",
	speech_url: DEFAULT_SPEECH_URL,
};

const entered = () => readSettingsSection("connections") ?? {};

function connection(name: ConnectionKey | ConnectionUrl): {
	value: string;
	source: ConnectionSource;
} {
	const own = entered()[name]?.trim();
	if (own) return { value: own, source: "settings" };
	const fromEnv = process.env[ENV_NAMES[name]]?.trim();
	if (fromEnv) return { value: fromEnv, source: "env" };
	if (name in URL_DEFAULTS)
		return { value: URL_DEFAULTS[name as ConnectionUrl], source: "default" };
	return { value: "", source: null };
}

const key = (name: ConnectionKey) => () => connection(name).value;
const url = (name: ConnectionUrl) => () => connection(name).value.replace(/\/+$/, "");

/** The endpoint of the replies set to "OpenAI compatible". */
export const openaiCompatibleUrl = url("openai_compatible_url");
/** Empty for an endpoint that wants none, such as Ollama. */
export const openaiCompatibleApiKey = key("openai_compatible_key");
/** The character's web search. */
export const exaApiKey = key("exa_key");
/** The character's apps. */
export const composioApiKey = key("composio_key");
/** Speech in and out, and the characters' ElevenLabs voices. */
export const elevenlabsApiKey = key("elevenlabs_key");
/** The characters' Fish Audio voices. */
export const fishAudioApiKey = key("fish_audio_key");
/** The speech.cpp server, which speaks and transcribes for the local providers. */
export const speechUrl = url("speech_url");

/** The connections for the screens: the addresses, and only whether each key is set. */
export function getConnections(): ConnectionsView {
	const keys = Object.fromEntries(
		CONNECTION_KEYS.map((k) => {
			const { value, source } = connection(k);
			return [k, { set: Boolean(value), source }];
		}),
	) as ConnectionsView["keys"];
	const urls = Object.fromEntries(
		CONNECTION_URLS.map((u) => [u, connection(u)]),
	) as ConnectionsView["urls"];
	return { keys, urls };
}

/** Changes the entered connections; an empty value clears one, so the environment applies again. */
export function updateConnections(patch: ConnectionsPatch): ConnectionsView {
	const next: Record<string, string | undefined> = { ...entered() };
	for (const [name, value] of Object.entries(patch)) {
		if (value === undefined) continue;
		if (value.trim()) next[name] = value.trim();
		else delete next[name];
	}
	writeSettingsSection("connections", next);
	return getConnections();
}
