// Calls to the conversation's LLM endpoint outside the AI SDK, and the errors any call to it
// ends with.

import type { LlmProvider } from "@nextroom/contracts";

import { ConflictError, messageOf } from "../lib/errors";
import { loadSettings } from "../settings/chat";
import { connectionOf, type LlmConnection, modelsRequest } from "./providers";

const LIST_TIMEOUT_MS = 30_000;

/** A call that did not reach the endpoint at `url`. */
export const unreachable = (url: string, error: unknown) =>
	new ConflictError(`LLM API に接続できません（${url}）: ${messageOf(error)}`);

/** A reply with no text. */
export const emptyReplyError = () => new ConflictError("LLM から空の返答が返りました");

/** The endpoint's own words for a failed call, when it gave any. */
export function llmErrorMessage(status: number | undefined, body: string): string {
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
	/** The endpoint's display name (Anthropic's display_name, OpenRouter's name), else the id. */
	name: string;
	/** USD per million tokens, when the endpoint lists prices (OpenRouter). */
	price?: { input: number; output: number };
}

/** A price per token as OpenRouter writes it, per million tokens; none for a missing or negative one. */
function perMillion(value: unknown): number | undefined {
	const n = typeof value === "string" && value ? Number(value) : Number.NaN;
	return Number.isFinite(n) && n >= 0 ? n * 1e6 : undefined;
}

/** The models the endpoint lists, sorted by id; `filter` is added to the request's query, and
 *  `imageOutput` prices the output by its image tokens. */
export async function listModels(
	connection: LlmConnection,
	{ filter, imageOutput = false }: { filter?: string; imageOutput?: boolean } = {},
): Promise<LlmModel[]> {
	const request = modelsRequest(connection);
	const { headers } = request;
	const url = filter
		? `${request.url}${request.url.includes("?") ? "&" : "?"}${filter}`
		: request.url;
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
			const output = imageOutput
				? perMillion(p.image_output ?? p.image_token)
				: perMillion(p.completion);
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

/** The models of the saved connection, or of `provider`'s connection instead of the chosen one. */
export function listLlmModels(provider?: LlmProvider): Promise<LlmModel[]> {
	const s = loadSettings();
	return listModels(connectionOf({ ...s, provider: provider ?? s.provider }, false));
}

/** OpenRouter's models that take an image and give `output`: a drawn image or a Decisions answer. */
export function listOpenrouterImageModels(output: "image" | "decisions"): Promise<LlmModel[]> {
	const connection = connectionOf({ ...loadSettings(), provider: "openrouter" }, false);
	return listModels(connection, {
		filter: `output_modalities=${output}&input_modalities=image`,
		imageOutput: output === "image",
	});
}
