// The conversation's settings: the reply's LLM, the custom prompt, speech and expression images.

import { z } from "zod";

/** The speech.cpp server (`speech serve`) the user starts, which listens on 8080 unless told. */
export const DEFAULT_SPEECH_URL = "http://127.0.0.1:8080";

/** parakeet: the recognition model of the speech.cpp server (named after its first model);
 *  elevenlabs: ElevenLabs Scribe. */
export const ASR_PROVIDERS = ["parakeet", "elevenlabs"] as const;
export type AsrProvider = (typeof ASR_PROVIDERS)[number];

/** openai_compatible: any Chat Completions endpoint (the connection's URL and key / model);
 *  anthropic: Claude through Anthropic's API (ANTHROPIC_API_KEY / anthropic_model);
 *  openrouter: OpenRouter with OPENROUTER_API_KEY. */
export const LLM_PROVIDERS = ["openai_compatible", "anthropic", "openrouter"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

/** The efforts each reply provider takes: Anthropic's `effort`, or `reasoning_effort` elsewhere. */
export const REASONING_EFFORTS = {
	anthropic: ["low", "medium", "high", "xhigh", "max"],
	openai_compatible: ["none", "minimal", "low", "medium", "high", "xhigh"],
	openrouter: ["none", "minimal", "low", "medium", "high", "xhigh"],
} as const satisfies Record<LlmProvider, readonly string[]>;

/** The saved effort if the chosen reply provider takes it; otherwise none is sent. */
export const replyEffortOf = (s: { provider: LlmProvider; reasoning_effort: string }) =>
	(REASONING_EFFORTS[s.provider] as readonly string[]).includes(s.reasoning_effort)
		? s.reasoning_effort
		: undefined;

/** The conversation's settings as stored. */
export const chatSettingsSchema = z.object({
	provider: z.enum(LLM_PROVIDERS),
	model: z.string(),
	anthropic_model: z.string(),
	openrouter_model: z.string(),
	/** Added after the fixed system prompt. */
	custom_prompt: z.string(),
	temperature: z.number(),
	/** null: the model's (or the endpoint's) default. */
	max_tokens: z.number().int().nullable(),
	/** Empty: the model's default. */
	reasoning_effort: z.string(),
	/** {{user}} in the characters' settings. */
	user_name: z.string(),
	asr_provider: z.enum(ASR_PROVIDERS),
	/** A recognition model of the speech.cpp server's catalog. Empty: the one the server holds. */
	asr_model: z.string(),
	/** Off: replies are text only, and nothing is synthesized. */
	tts_enabled: z.boolean(),
	/** Off: the face in a call does not change with the reply. */
	face_changes_enabled: z.boolean(),
	/** The Decisions model that tags expression images and chooses the faces in a call. Empty:
	 *  images cannot be tagged, and the face does not change. */
	image_tag_model: z.string(),
	/** OpenRouter's model, for expression images and the image tool. Empty: images cannot be drawn. */
	image_gen_model: z.string(),
});
export type ChatSettings = z.infer<typeof chatSettingsSchema>;

/** The field that holds each reply provider's model name. */
export const LLM_MODEL_FIELDS = {
	openai_compatible: "model",
	anthropic: "anthropic_model",
	openrouter: "openrouter_model",
} as const satisfies Record<LlmProvider, keyof ChatSettings>;

/** The model name set for the chosen reply provider. */
export const replyModelOf = (s: ChatSettings) => s[LLM_MODEL_FIELDS[s.provider]];

/** The settings as the API answers them, with the connections of the server's .env: the
 *  addresses, and only whether each key is set. */
export type ChatSettingsView = ChatSettings & {
	base_url: string;
	speech_url: string;
	has_api_key: boolean;
	has_anthropic_api_key: boolean;
	has_openrouter_api_key: boolean;
	has_exa_api_key: boolean;
	has_composio_api_key: boolean;
	has_elevenlabs_api_key: boolean;
};

const trimmed = z.string().trim();
const reasoningEffort = z
	.string()
	.trim()
	.refine(
		(v) =>
			v === "" ||
			Object.values(REASONING_EFFORTS).some((e) => (e as readonly string[]).includes(v)),
		"不明な effort",
	);

const patchFields = chatSettingsSchema.extend({
	model: trimmed,
	anthropic_model: trimmed,
	openrouter_model: trimmed,
	reasoning_effort: reasoningEffort,
	user_name: trimmed,
	asr_model: trimmed,
	image_tag_model: trimmed,
	image_gen_model: trimmed,
}).shape;

/** A change to the settings; a missing field stays as it is, and so does a null one except the max_tokens it clears. */
export const chatSettingsPatchSchema = z.object(
	Object.fromEntries(Object.entries(patchFields).map(([k, v]) => [k, z.nullish(v)])) as {
		[K in keyof typeof patchFields]: z.ZodOptional<z.ZodNullable<(typeof patchFields)[K]>>;
	},
);
export type ChatSettingsPatch = z.infer<typeof chatSettingsPatchSchema>;
