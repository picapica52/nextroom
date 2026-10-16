// The providers the replies can use, each in one place: where it is and which key it takes,
// and the shape the AI SDK, its model list, the reasoning effort and Stagehand want it in.
// Any endpoint that speaks OpenAI's Chat Completions (OpenAI, Ollama, LM Studio, llama.cpp
// server, vLLM, ...) is `openai_compatible`; OpenRouter is one with its own key; Claude goes
// through Anthropic's Messages API.

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ModelConfiguration } from "@mastra/stagehand";
import { type ChatSettings, type LlmProvider, replyModelOf } from "@nextroom/contracts";

import { BadRequestError } from "../lib/errors";
import { OPENROUTER_API_URL } from "../lib/openrouter";
import {
	anthropicApiKey,
	openaiCompatibleApiKey,
	openaiCompatibleUrl,
	openrouterApiKey,
} from "../settings/chat";

export interface LlmConnection {
	provider: LlmProvider;
	/** Without /chat/completions (or /messages for Anthropic). */
	baseUrl: string;
	/** Empty for an endpoint that wants none, such as Ollama. */
	apiKey: string;
	model: string;
}

const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
/** The AI SDK provider name of an OpenAI-compatible endpoint, which its options are keyed by. */
const OPENAI_COMPATIBLE = "llm";

const baseUrlOf = (connection: LlmConnection) => connection.baseUrl.trim().replace(/\/+$/, "");

interface ProviderSpec {
	/** The environment variable of its key, named when the key is missing; null for one that needs none. */
	keyName: string | null;
	endpoint: () => { baseUrl: string; apiKey: string };
	languageModel: (connection: LlmConnection) => unknown;
	modelsRequest: (connection: LlmConnection) => { url: string; headers: Record<string, string> };
	effortOptions: (effort: string) => Record<string, Record<string, string>>;
	stagehandModel: (connection: LlmConnection) => ModelConfiguration;
}

const openaiCompatible = {
	languageModel: (connection: LlmConnection) =>
		createOpenAICompatible({
			name: OPENAI_COMPATIBLE,
			baseURL: baseUrlOf(connection),
			apiKey: connection.apiKey.trim() || undefined,
		}).chatModel(connection.model.trim()),
	modelsRequest: (connection: LlmConnection) => ({
		url: `${baseUrlOf(connection)}/models`,
		headers: {
			accept: "application/json",
			...(connection.apiKey ? { authorization: `Bearer ${connection.apiKey}` } : {}),
		},
	}),
	effortOptions: (effort: string) => ({ [OPENAI_COMPATIBLE]: { reasoningEffort: effort } }),
	// Stagehand's "openai" provider over the endpoint's Chat Completions API.
	stagehandModel: (connection: LlmConnection): ModelConfiguration => ({
		modelName: `openai/${connection.model}` as never,
		apiKey: connection.apiKey || "none",
		baseURL: connection.baseUrl.replace(/\/+$/, ""),
		openaiEndpointFormat: "chat",
	}),
};

const PROVIDERS = {
	openai_compatible: {
		...openaiCompatible,
		keyName: null,
		endpoint: () => ({ baseUrl: openaiCompatibleUrl(), apiKey: openaiCompatibleApiKey() }),
	},
	openrouter: {
		...openaiCompatible,
		keyName: "OPENROUTER_API_KEY",
		endpoint: () => ({
			baseUrl: `${OPENROUTER_API_URL}/v1`,
			apiKey: openrouterApiKey(),
		}),
	},
	anthropic: {
		keyName: "ANTHROPIC_API_KEY",
		endpoint: () => ({ baseUrl: ANTHROPIC_BASE_URL, apiKey: anthropicApiKey() }),
		languageModel: (connection: LlmConnection) =>
			createAnthropic({
				baseURL: baseUrlOf(connection),
				apiKey: connection.apiKey.trim(),
			})(connection.model.trim()),
		modelsRequest: (connection: LlmConnection) => ({
			url: `${baseUrlOf(connection)}/models?limit=1000`,
			headers: {
				accept: "application/json",
				"x-api-key": connection.apiKey,
				"anthropic-version": "2023-06-01",
			},
		}),
		effortOptions: (effort: string) => ({ anthropic: { effort } }),
		stagehandModel: (connection: LlmConnection): ModelConfiguration => ({
			modelName: `anthropic/${connection.model}` as never,
			apiKey: connection.apiKey,
		}),
	},
} satisfies Record<LlmProvider, ProviderSpec>;

/** The connection for the chosen provider; `requireModel: false` for listing the models. */
export function connectionOf(settings: ChatSettings, requireModel = true): LlmConnection {
	const { provider } = settings;
	const spec: ProviderSpec = PROVIDERS[provider];
	const model = replyModelOf(settings);
	const { baseUrl, apiKey } = spec.endpoint();
	if (spec.keyName && !apiKey)
		throw new BadRequestError(`.env で ${spec.keyName} を設定してください`);
	if (requireModel && !model)
		throw new BadRequestError("設定 → モデル で 返答モデル を指定してください");
	return { provider, baseUrl, apiKey, model };
}

export const languageModel = (connection: LlmConnection) =>
	PROVIDERS[connection.provider].languageModel(connection);

/** The request that lists the endpoint's models. */
export const modelsRequest = (connection: LlmConnection) =>
	PROVIDERS[connection.provider].modelsRequest(connection);

/** The effort, in the shape the connection's provider takes it. */
export const effortOptions = (
	connection: LlmConnection,
	effort?: string,
): Record<string, Record<string, string>> | undefined =>
	effort ? PROVIDERS[connection.provider].effortOptions(effort) : undefined;

/** The connection as Stagehand's model, so the browser reads pages with the same LLM. */
export const stagehandModel = (connection: LlmConnection) =>
	PROVIDERS[connection.provider].stagehandModel(connection);
