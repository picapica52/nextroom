// The providers the replies can use, through pi (@earendil-works/pi-ai): where each one is, which
// key it takes, and the model pi calls it with. Any endpoint that speaks OpenAI's Chat Completions
// (OpenAI, Ollama, LM Studio, llama.cpp server, vLLM, ...) is `openai_compatible`; OpenRouter is
// one with its own key; Claude goes through Anthropic's Messages API; the subscriptions go
// through pi's own providers with the credentials the user signed in with (auth.ts). Every other
// provider pi has is offered as it is ("pi:<id>"), signed in to the way pi asks.

import type { StreamFn } from "@earendil-works/pi-agent-core";
import {
	type Api,
	type ApiKeyAuth,
	type AuthContext,
	createProvider,
	defaultProviderAuthContext,
	type Model,
	type MutableModels,
	type ThinkingLevel,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import {
	type AppProvider,
	type ChatSettings,
	isPiProvider,
	isSubscription,
	type LlmProvider,
	type ModelChoice,
	type PiProviderId,
	type SubscriptionProvider,
} from "@nextroom/contracts";

import { BadRequestError } from "../lib/errors";
import {
	anthropicApiKey,
	openaiCompatibleApiKey,
	openaiCompatibleUrl,
	openrouterApiKey,
} from "../settings/chat";
import { credentials, isSignedIn, PI_PROVIDERS } from "./auth";

/** OpenRouter's API root; its OpenAI-compatible endpoints are under /v1. */
const OPENROUTER_API_URL = "https://openrouter.ai/api";

export interface LlmConnection {
	provider: LlmProvider;
	/** Without /chat/completions (or /messages for Anthropic); empty for a subscription. */
	baseUrl: string;
	/** Empty for an endpoint that wants none, such as Ollama, and for a subscription. */
	apiKey: string;
	model: string;
	/** Null: the model's default. */
	thinking: ModelChoice["thinking"];
}

const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
/** pi's provider of the OpenAI-compatible endpoint of the settings. */
const OPENAI_COMPATIBLE = "nextroom-openai-compatible";

const SUBSCRIPTION_NAMES: Record<SubscriptionProvider, string> = {
	chatgpt: "ChatGPT",
	claude: "Claude",
	copilot: "GitHub Copilot",
	grok: "SuperGrok",
};

const baseUrlOf = (connection: LlmConnection) => connection.baseUrl.trim().replace(/\/+$/, "");

/** Credentials only from what is passed or signed in to, never from this process's environment:
 *  a subscription the user is not signed in to must not fall back to an API key. */
const noAmbientAuth: AuthContext = {
	env: async () => undefined,
	fileExists: async () => false,
};

/** pi's providers the app offers in its own way: the subscriptions keep their credentials under
 *  these ids, and OpenRouter's key is a connection of its own. */
const isOwnPiProvider = (id: string) =>
	id === "openrouter" || (Object.values(PI_PROVIDERS) as string[]).includes(id);

const ambientAuth = defaultProviderAuthContext();

/** The other providers may also find their keys in this process's environment (apps/server/.env),
 *  as the connections do, and the cloud credentials they read from files (AWS, Google Cloud). */
function withAmbientAuth(auth: ApiKeyAuth): ApiKeyAuth {
	const ctx = (own: AuthContext): AuthContext => ({
		env: async (name) => (await own.env(name)) ?? (await ambientAuth.env(name)),
		fileExists: async (path) =>
			(await own.fileExists(path)) || (await ambientAuth.fileExists(path)),
	});
	const { check } = auth;
	return {
		...auth,
		resolve: (input) => auth.resolve({ ...input, ctx: ctx(input.ctx) }),
		...(check ? { check: (input) => check({ ...input, ctx: ctx(input.ctx) }) } : {}),
	};
}

let models: MutableModels | null = null;

/** pi's providers and models, with the subscriptions' credentials. */
export function piModels(): MutableModels {
	if (models) return models;
	models = builtinModels({ credentials, authContext: noAmbientAuth });
	for (const provider of models.getProviders()) {
		if (isOwnPiProvider(provider.id) || !provider.auth.apiKey) continue;
		models.setProvider({
			...provider,
			auth: { ...provider.auth, apiKey: withAmbientAuth(provider.auth.apiKey) },
		});
	}
	models.setProvider(
		createProvider({
			id: OPENAI_COMPATIBLE,
			name: "OpenAI 互換",
			auth: {
				apiKey: {
					name: "API key",
					resolve: async ({ credential }) => ({ auth: { apiKey: credential?.key || "none" } }),
				},
			},
			models: [],
			api: openAICompletionsApi(),
		}),
	);
	return models;
}

export const piIdOf = (provider: PiProviderId) => provider.slice("pi:".length);

/** pi's other providers, by the app's id: those that have models, or list them once signed in. */
export function piProviderIds(): PiProviderId[] {
	return piModels()
		.getProviders()
		.filter(
			(p) =>
				!isOwnPiProvider(p.id) &&
				p.id !== OPENAI_COMPATIBLE &&
				(p.getModels().length > 0 || p.refreshModels),
		)
		.map((p) => `pi:${p.id}` as const)
		.sort((a, b) => a.localeCompare(b));
}

export const piProviderName = (provider: PiProviderId) =>
	piModels().getProvider(piIdOf(provider))?.name ?? piIdOf(provider);

const FREE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** OpenAI itself is detected by pi; any other server (Ollama, LM Studio, llama.cpp, vLLM, ...)
 *  gets the plain Chat Completions fields that all of them take. */
function openaiCompatibleCompat(baseUrl: string) {
	if (/^https:\/\/api\.openai\.com\b/.test(baseUrl)) return { supportsReasoningEffort: true };
	return {
		supportsReasoningEffort: true,
		supportsDeveloperRole: false,
		supportsStore: false,
		maxTokensField: "max_tokens" as const,
	};
}

/** A model pi does not know, called with the API it is served through. */
function unlistedModel(connection: LlmConnection): Model<Api> {
	const base = {
		id: connection.model,
		name: connection.model,
		reasoning: true,
		input: ["text", "image"] as ("text" | "image")[],
		cost: FREE,
		contextWindow: 128_000,
		maxTokens: 16_384,
	};
	switch (connection.provider) {
		case "anthropic":
			return {
				...base,
				api: "anthropic-messages",
				provider: "anthropic",
				baseUrl: baseUrlOf(connection).replace(/\/v1$/, ""),
				contextWindow: 200_000,
				maxTokens: 64_000,
			};
		case "openrouter":
			return {
				...base,
				api: "openai-completions",
				provider: "openrouter",
				baseUrl: baseUrlOf(connection),
				compat: { thinkingFormat: "openrouter" },
			} as Model<Api>;
		default:
			return {
				...base,
				api: "openai-completions",
				provider: OPENAI_COMPATIBLE,
				baseUrl: baseUrlOf(connection),
				compat: openaiCompatibleCompat(baseUrlOf(connection)),
			} as Model<Api>;
	}
}

/** The model pi calls for the connection. */
export function modelOf(connection: LlmConnection): Model<Api> {
	const { provider, model } = connection;
	if (isPiProvider(provider)) {
		const known = piModels().getModel(piIdOf(provider), model);
		if (!known)
			throw new BadRequestError(
				`${piProviderName(provider)} のモデル ${model} が見つかりません。設定 → モデル で選び直してください`,
			);
		return known;
	}
	if (isSubscription(provider)) {
		const known = piModels().getModel(PI_PROVIDERS[provider], model);
		if (!known)
			throw new BadRequestError(
				`${SUBSCRIPTION_NAMES[provider]} のモデル ${model} が見つかりません。設定 → モデル で選び直してください`,
			);
		return known;
	}
	if (provider === "openai_compatible") return unlistedModel(connection);
	const known = piModels().getModel(provider, model);
	if (!known) return unlistedModel(connection);
	return provider === "anthropic" ? known : { ...known, baseUrl: baseUrlOf(connection) };
}

/** The key the call is made with; none for a subscription or another of pi's providers, whose
 *  credentials pi reads itself. */
export const apiKeyOf = (connection: LlmConnection): string | undefined =>
	isSubscription(connection.provider) || isPiProvider(connection.provider)
		? undefined
		: connection.apiKey.trim() || "none";

/** pi's thinking level for the connection; none for the model's default. */
export const thinkingLevelOf = (connection: LlmConnection) =>
	(connection.thinking ?? undefined) as ThinkingLevel | undefined;

/** How a reply's agent calls the connection's model. */
export function streamFnOf(connection: LlmConnection): StreamFn {
	const apiKey = apiKeyOf(connection);
	return (model, context, options) =>
		piModels().streamSimple(model, context as never, { ...options, apiKey });
}

const ENDPOINTS: Record<
	Exclude<AppProvider, SubscriptionProvider>,
	{ keyName: string | null; endpoint: () => { baseUrl: string; apiKey: string } }
> = {
	openai_compatible: {
		keyName: null,
		endpoint: () => ({ baseUrl: openaiCompatibleUrl(), apiKey: openaiCompatibleApiKey() }),
	},
	openrouter: {
		keyName: "OPENROUTER_API_KEY",
		endpoint: () => ({ baseUrl: `${OPENROUTER_API_URL}/v1`, apiKey: openrouterApiKey() }),
	},
	anthropic: {
		keyName: "ANTHROPIC_API_KEY",
		endpoint: () => ({ baseUrl: ANTHROPIC_BASE_URL, apiKey: anthropicApiKey() }),
	},
};

const NO_KEY: Record<string, string> = {
	OPENROUTER_API_KEY: "OpenRouter",
	ANTHROPIC_API_KEY: "Anthropic",
};

/** Where `provider` is and the key it takes, for any of its models (listing them, too). */
export function providerConnection(provider: LlmProvider, model = ""): LlmConnection {
	if (isPiProvider(provider)) {
		if (!piProviderIds().includes(provider))
			throw new BadRequestError(`プロバイダー ${piIdOf(provider)} はありません`);
		return { provider, baseUrl: "", apiKey: "", model, thinking: null };
	}
	if (isSubscription(provider)) {
		if (!isSignedIn(provider))
			throw new BadRequestError(
				`設定 → モデル で ${SUBSCRIPTION_NAMES[provider]} にサインインしてください`,
			);
		return { provider, baseUrl: "", apiKey: "", model, thinking: null };
	}
	const spec = ENDPOINTS[provider];
	const { baseUrl, apiKey } = spec.endpoint();
	if (spec.keyName && !apiKey)
		throw new BadRequestError(
			`設定 → モデル で ${NO_KEY[spec.keyName] ?? spec.keyName} の API キーを登録してください`,
		);
	return { provider, baseUrl, apiKey, model, thinking: null };
}

/** The connection of a model the settings chose. */
export const connectionOf = (choice: ModelChoice): LlmConnection => ({
	...providerConnection(choice.provider, choice.model),
	thinking: choice.thinking,
});

/** What a reply is tried with, in order: the character's own model or the main model, then the
 *  fallbacks. A fallback that cannot be used now (no key, not signed in) is left out. */
export function replyConnections(
	settings: ChatSettings,
	own?: ModelChoice | null,
): LlmConnection[] {
	const main = own ?? settings.main_model;
	if (!main) throw new BadRequestError("設定 → モデル で メインモデル を選んでください");
	const out = [connectionOf(main)];
	for (const choice of settings.fallback_models) {
		try {
			out.push(connectionOf(choice));
		} catch (error) {
			console.warn(`Left out the fallback model ${choice.provider}/${choice.model}:`, error);
		}
	}
	return out;
}

/** The request that lists an API endpoint's models. */
export function modelsRequest(connection: LlmConnection): {
	url: string;
	headers: Record<string, string>;
} {
	const url = baseUrlOf(connection);
	if (connection.provider === "anthropic")
		return {
			url: `${url}/models?limit=1000`,
			headers: {
				accept: "application/json",
				"x-api-key": connection.apiKey,
				"anthropic-version": "2023-06-01",
			},
		};
	return {
		url: `${url}/models`,
		headers: {
			accept: "application/json",
			...(connection.apiKey ? { authorization: `Bearer ${connection.apiKey}` } : {}),
		},
	};
}
