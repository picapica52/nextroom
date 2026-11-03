// The conversation's settings: the models, the custom prompt and speech; and the
// connections to the services the app uses.

import { z } from "zod";

/** The speech.cpp server (`speech serve`) the user starts, which listens on 8080 unless told. */
export const DEFAULT_SPEECH_URL = "http://127.0.0.1:8080";

/** parakeet: the recognition model of the speech.cpp server (named after its first model);
 *  elevenlabs: ElevenLabs Scribe. */
export const ASR_PROVIDERS = ["parakeet", "elevenlabs", "fishaudio"] as const;
export type AsrProvider = (typeof ASR_PROVIDERS)[number];

/** The providers the app sets up itself.
 *  openai_compatible: any Chat Completions endpoint (the connection's URL and key);
 *  anthropic: Claude through Anthropic's API key;
 *  openrouter: OpenRouter with its key;
 *  chatgpt / claude / copilot / grok: a subscription the user signs in to (ChatGPT Plus/Pro,
 *  Claude Pro/Max, GitHub Copilot, SuperGrok / X Premium). */
export const APP_PROVIDERS = [
	"openai_compatible",
	"anthropic",
	"openrouter",
	"chatgpt",
	"claude",
	"copilot",
	"grok",
] as const;
export type AppProvider = (typeof APP_PROVIDERS)[number];

/** Any other provider pi offers, by pi's id: "pi:groq", "pi:opencode", ... */
export type PiProviderId = `pi:${string}`;
export const piProviderIdSchema = z
	.string()
	.regex(/^pi:[a-z0-9][a-z0-9.-]*$/) as z.ZodType<PiProviderId>;
export const isPiProvider = (p: string): p is PiProviderId => p.startsWith("pi:");

export type LlmProvider = AppProvider | PiProviderId;
export const llmProviderSchema = z.union([z.enum(APP_PROVIDERS), piProviderIdSchema]);

/** The providers the user signs in to with a subscription instead of an API key. */
export const SUBSCRIPTION_PROVIDERS = ["chatgpt", "claude", "copilot", "grok"] as const;
export type SubscriptionProvider = (typeof SUBSCRIPTION_PROVIDERS)[number];

export const isSubscription = (p: string): p is SubscriptionProvider =>
	(SUBSCRIPTION_PROVIDERS as readonly string[]).includes(p);

/** How hard the model thinks before it answers; null in a choice: the model's default. pi fits
 *  the level to what the model takes. */
export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/** A model of a provider, with how hard it thinks. */
export const modelChoiceSchema = z.object({
	provider: llmProviderSchema,
	model: z.string().trim().min(1),
	thinking: z.enum(THINKING_LEVELS).nullable(),
});
export type ModelChoice = z.infer<typeof modelChoiceSchema>;

/** The conversation's settings as stored. */
export const chatSettingsSchema = z.object({
	/** What every character replies with unless it has a model of its own. Null: none chosen yet. */
	main_model: modelChoiceSchema.nullable(),
	/** Tried in order when the main model fails before it says anything. */
	fallback_models: z.array(modelChoiceSchema).max(5),
	/** Checks the characters' actions in the Auto approval mode. Null: Auto asks like Ask. */
	approval_model: modelChoiceSchema.nullable(),
	/** Added after the fixed system prompt, for every character. */
	custom_prompt: z.string(),
	temperature: z.number(),
	/** null: the model's (or the endpoint's) default. */
	max_tokens: z.number().int().nullable(),
	/** {{user}} in the characters' settings. */
	user_name: z.string().trim(),
	asr_provider: z.enum(ASR_PROVIDERS),
	/** A recognition model of the speech.cpp server's catalog. Empty: the one the server holds. */
	asr_model: z.string().trim(),
	/** Off: replies are text only, and nothing is synthesized. */
	tts_enabled: z.boolean(),
});
export type ChatSettings = z.infer<typeof chatSettingsSchema>;
export type ChatSettingsView = ChatSettings;

/** A change to the settings; a missing field stays as it is. */
export const chatSettingsPatchSchema = chatSettingsSchema.partial();
export type ChatSettingsPatch = z.infer<typeof chatSettingsPatchSchema>;

/** The services' API keys, entered on the settings screens; an empty one falls back to the
 *  server's .env. */
export const CONNECTION_KEYS = [
	"openai_compatible_key",
	"openrouter_key",
	"anthropic_key",
	"exa_key",
	"composio_key",
	"elevenlabs_key",
	"fish_audio_key",
] as const;
export type ConnectionKey = (typeof CONNECTION_KEYS)[number];

/** The services' addresses, entered the same way. */
export const CONNECTION_URLS = ["openai_compatible_url", "speech_url"] as const;
export type ConnectionUrl = (typeof CONNECTION_URLS)[number];

/** Where a connection's value comes from. */
export type ConnectionSource = "settings" | "env" | "default" | null;

/** The connections as the API answers them: never the keys themselves, only whether each is set. */
export interface ConnectionsView {
	keys: Record<ConnectionKey, { set: boolean; source: ConnectionSource }>;
	urls: Record<ConnectionUrl, { value: string; source: ConnectionSource }>;
}

/** A change to the connections; an empty value clears what was entered (the .env applies again). */
export const connectionsPatchSchema = z.object({
	...Object.fromEntries(CONNECTION_KEYS.map((k) => [k, z.string().trim().optional()])),
	...Object.fromEntries(
		CONNECTION_URLS.map((k) => [
			k,
			z.union([z.literal(""), z.url({ protocol: /^https?$/ })]).optional(),
		]),
	),
}) as z.ZodType<Partial<Record<ConnectionKey | ConnectionUrl, string>>>;
export type ConnectionsPatch = Partial<Record<ConnectionKey | ConnectionUrl, string>>;

/** A subscription and whether the user is signed in to it. */
export interface SubscriptionStatus {
	provider: SubscriptionProvider;
	signed_in: boolean;
}

/** What a sign-in asks the user now: a code the page gave back, an API key or another value, or
 *  one of a few choices (answered with the option's id). */
export interface LoginPrompt {
	type: "manual_code" | "secret" | "text" | "select";
	message: string;
	placeholder: string | null;
	options: { id: string; label: string; description: string | null }[];
}

/** A sign-in in progress: what the user is shown (a page to open, a code to enter there, or a
 *  question to answer) until it ends. */
export interface SubscriptionLogin {
	id: string;
	provider: SubscriptionProvider | PiProviderId;
	status: "pending" | "done" | "error" | "cancelled";
	/** The page to open and sign in on. */
	url: string | null;
	/** The code to enter on `url` (device code sign-in). */
	user_code: string | null;
	/** What the sign-in waits for the user to answer. */
	prompt: LoginPrompt | null;
	/** What is happening now, in the provider's words. */
	message: string | null;
	error: string | null;
}

/** One of pi's other providers: how it is signed in to, and whether it can be used now. */
export interface PiProviderStatus {
	id: PiProviderId;
	name: string;
	/** The names pi gives its ways of signing in; null for one it does not offer. */
	auth: { api_key: string | null; oauth: string | null };
	configured: boolean;
	/** Where the credentials come from: entered here ("stored credential"), or the environment's
	 *  variable that holds them. */
	source: string | null;
	/** Entered here, so they can be removed. */
	stored: boolean;
}

export const piLoginSchema = z.object({ type: z.enum(["api_key", "oauth"]) });

export const subscriptionCodeSchema = z.object({ code: z.string().trim() });
