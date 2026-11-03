// The models each provider offers, and the errors any call to the conversation's LLM ends with.
// pi's providers offer what pi's catalog says they may use; the OpenAI-compatible endpoint lists
// its own.

import { type LlmProvider, OPENAI_COMPATIBLE } from "@nextroom/contracts";

import { BadRequestError, ConflictError, messageOf } from "../lib/errors";
import {
	type LlmConnection,
	modelsRequest,
	piModels,
	providerConnection,
	providerName,
} from "./providers";

const LIST_TIMEOUT_MS = 30_000;

/** A call that did not reach the endpoint at `url`. */
const unreachable = (url: string, error: unknown) =>
	new ConflictError(`LLM API に接続できません（${url}）: ${messageOf(error)}`);

/** A reply with no text. */
export const emptyReplyError = () => new ConflictError("LLM から空の返答が返りました");

/** The endpoint's own words for a failed call, when it gave any. */
function llmErrorMessage(status: number | undefined, body: string): string {
	let detail = body.slice(0, 500);
	try {
		const error = (JSON.parse(body) as { error?: unknown }).error;
		if (error && typeof error === "object" && "message" in error) detail = String(error.message);
		else if (typeof error === "string" && error) detail = error;
	} catch {
		// not JSON
	}
	return status ? `LLM API エラー (${status}): ${detail}` : `LLM API エラー: ${detail}`;
}

export interface LlmModel {
	id: string;
	/** The model's display name, else the id. */
	name: string;
	/** USD per million tokens, when they are known. */
	price?: { input: number; output: number };
}

/** A price per token as OpenRouter writes it, per million tokens; none for a missing or negative one. */
function perMillion(value: unknown): number | undefined {
	const n = typeof value === "string" && value ? Number(value) : Number.NaN;
	return Number.isFinite(n) && n >= 0 ? n * 1e6 : undefined;
}

/** The models the endpoint lists, sorted by id. */
async function listModels(connection: LlmConnection): Promise<LlmModel[]> {
	const { url, headers } = modelsRequest(connection);
	let response: Response;
	try {
		response = await fetch(url, { headers, signal: AbortSignal.timeout(LIST_TIMEOUT_MS) });
	} catch (error) {
		throw unreachable(url, error);
	}
	const body = await response.text();
	if (!response.ok) throw new ConflictError(llmErrorMessage(response.status, body));
	let data: {
		data?: {
			id?: unknown;
			display_name?: unknown;
			name?: unknown;
			pricing?: Record<string, unknown>;
		}[];
	};
	try {
		data = JSON.parse(body);
	} catch {
		throw new ConflictError(`LLM API のモデル一覧を読み取れません（${url}）`);
	}
	const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
	return (data.data ?? [])
		.flatMap((m) => {
			const id = text(m?.id);
			if (!id) return [];
			const p = m.pricing ?? {};
			const input = perMillion(p.prompt);
			const output = perMillion(p.completion);
			return [
				{
					id,
					name: text(m.display_name) || text(m.name) || id,
					...(input !== undefined && output !== undefined ? { price: { input, output } } : {}),
				},
			];
		})
		.sort((a, b) => a.id.localeCompare(b.id));
}

/** The models of `provider` in pi's catalog that can be used now, brought up to date when it can be. */
async function catalogModels(provider: LlmProvider): Promise<LlmModel[]> {
	const models = piModels();
	const auth = await models.checkAuth(provider).catch(() => undefined);
	if (!auth)
		throw new BadRequestError(`設定 → 接続 で ${providerName(provider)} を設定してください`);
	await models
		.refresh({ providers: [provider], signal: AbortSignal.timeout(LIST_TIMEOUT_MS) })
		.catch((error) => console.warn(`Could not refresh the models of ${provider}:`, error));
	return (await models.getAvailable(provider))
		.map((m) => ({
			id: m.id,
			name: m.name || m.id,
			...(m.cost.input > 0 || m.cost.output > 0
				? { price: { input: m.cost.input, output: m.cost.output } }
				: {}),
		}))
		.sort((a, b) => a.id.localeCompare(b.id));
}

/** The models `provider` offers. */
export function listLlmModels(provider: LlmProvider): Promise<LlmModel[]> {
	const connection = providerConnection(provider);
	if (provider === OPENAI_COMPATIBLE) return listModels(connection);
	return catalogModels(provider);
}
