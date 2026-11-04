// The providers the replies can use, through pi (@earendil-works/pi-ai): every provider pi has, by
// pi's id, signed in to the way pi offers for it (auth.ts), and one the app adds to pi: any endpoint
// that speaks OpenAI's Chat Completions (OpenAI, Ollama, LM Studio, llama.cpp server, vLLM, ...) at
// the URL of the settings.

import type { StreamFn } from "@earendil-works/pi-agent-core";
import {
	type Api,
	createProvider,
	defaultProviderAuthContext,
	type Model,
	type MutableModels,
	type ThinkingLevel,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import {
	type ChatSettings,
	type LlmProvider,
	type ModelChoice,
	OPENAI_COMPATIBLE,
} from "@nextroom/contracts";

import { BadRequestError } from "../lib/errors";
import { openaiCompatibleApiKey, openaiCompatibleUrl } from "../settings/chat";
import { credentials } from "./auth";

export interface LlmConnection {
	provider: LlmProvider;
	/** The OpenAI-compatible endpoint, without /chat/completions; empty for pi's providers. */
	baseUrl: string;
	/** The OpenAI-compatible endpoint's key; empty for one that wants none, such as Ollama, and for
	 *  pi's providers, whose credentials pi reads itself. */
	apiKey: string;
	model: string;
	/** Null: the model's default. */
	thinking: ModelChoice["thinking"];
}

const baseUrlOf = (connection: LlmConnection) => connection.baseUrl.trim().replace(/\/+$/, "");

let models: MutableModels | null = null;

/** pi's providers and models, with the credentials entered here, else those of this process's
 *  environment (apps/server/.env) and the cloud credentials pi reads from files (AWS, Google Cloud). */
export function piModels(): MutableModels {
	if (models) return models;
	models = builtinModels({ credentials, authContext: defaultProviderAuthContext() });
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

/** pi's providers that can be chosen: those that have models, or list them once signed in. Those pi
 *  keeps only for old sign-ins are left out. */
export function providerIds(): LlmProvider[] {
	return piModels()
		.getProviders()
		.filter(
			(p) =>
				p.id !== OPENAI_COMPATIBLE &&
				!/legacy/i.test(p.name) &&
				(p.getModels().length > 0 || p.refreshModels),
		)
		.map((p) => p.id)
		.sort((a, b) => a.localeCompare(b));
}

export const providerName = (provider: LlmProvider) =>
	piModels().getProvider(provider)?.name ?? provider;

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

/** The model pi calls for the connection: one of pi's catalog, or any model of the
 *  OpenAI-compatible endpoint. */
export function modelOf(connection: LlmConnection): Model<Api> {
	const { provider, model } = connection;
	if (provider === OPENAI_COMPATIBLE)
		return {
			id: model,
			name: model,
			reasoning: true,
			input: ["text", "image"],
			cost: FREE,
			contextWindow: 128_000,
			maxTokens: 16_384,
			api: "openai-completions",
			provider: OPENAI_COMPATIBLE,
			baseUrl: baseUrlOf(connection),
			compat: openaiCompatibleCompat(baseUrlOf(connection)),
		} as Model<Api>;
	const known = piModels().getModel(provider, model);
	if (!known)
		throw new BadRequestError(
			`${providerName(provider)} のモデル ${model} が見つかりません。設定 → モデル で選び直してください`,
		);
	return known;
}

/** The key the call is made with: the OpenAI-compatible endpoint's; none for pi's providers,
 *  whose credentials pi reads itself. */
export const apiKeyOf = (connection: LlmConnection): string | undefined =>
	connection.provider === OPENAI_COMPATIBLE ? connection.apiKey.trim() || "none" : undefined;

/** pi's thinking level for the connection; none for the model's default. */
export const thinkingLevelOf = (connection: LlmConnection) =>
	(connection.thinking ?? undefined) as ThinkingLevel | undefined;

/** How a reply's agent calls the connection's model. */
export function streamFnOf(connection: LlmConnection): StreamFn {
	const apiKey = apiKeyOf(connection);
	return (model, context, options) =>
		piModels().streamSimple(model, context as never, { ...options, apiKey });
}

/** Where `provider` is and the key it takes, for any of its models (listing them, too). pi reads
 *  the credentials of its own providers itself. */
export function providerConnection(provider: LlmProvider, model = ""): LlmConnection {
	if (provider === OPENAI_COMPATIBLE)
		return {
			provider,
			baseUrl: openaiCompatibleUrl(),
			apiKey: openaiCompatibleApiKey(),
			model,
			thinking: null,
		};
	if (!providerIds().includes(provider))
		throw new BadRequestError(
			`プロバイダー ${provider} はありません。設定 → モデル で選び直してください`,
		);
	return { provider, baseUrl: "", apiKey: "", model, thinking: null };
}

/** The connection of a model the settings chose. */
export const connectionOf = (choice: ModelChoice): LlmConnection => ({
	...providerConnection(choice.provider, choice.model),
	thinking: choice.thinking,
});

/** What a reply is made with: the character's own model or the main model. */
export function replyConnection(settings: ChatSettings, own?: ModelChoice | null): LlmConnection {
	const main = own ?? settings.main_model;
	if (!main) throw new BadRequestError("設定 → モデル で メインモデル を選んでください");
	return connectionOf(main);
}

/** The request that lists the OpenAI-compatible endpoint's models. */
export function modelsRequest(connection: LlmConnection): {
	url: string;
	headers: Record<string, string>;
} {
	return {
		url: `${baseUrlOf(connection)}/models`,
		headers: {
			accept: "application/json",
			...(connection.apiKey ? { authorization: `Bearer ${connection.apiKey}` } : {}),
		},
	};
}
