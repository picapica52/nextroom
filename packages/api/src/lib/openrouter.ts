// OpenRouter's HTTP API, shared by the image and decision clients. Each checks its
// own model and reads its own answer.

import { BadRequestError, ConflictError } from "./errors";

/** OpenRouter's API root; its OpenAI-compatible endpoints are under /v1. */
export const OPENROUTER_API_URL = "https://openrouter.ai/api";

/** The OpenRouter key, or a BadRequestError asking for it. */
export function requireOpenrouterKey(key: string): string {
	if (!key) throw new BadRequestError(".env で OPENROUTER_API_KEY を設定してください");
	return key;
}

/** POST `body` (awaited once inside, so a failing promise counts as a failed connection) to
 *  `path` under /api, and the parsed JSON answer; a failed request is a ConflictError. */
export async function postOpenrouter<T>(
	key: string,
	path: string,
	body: unknown,
	signal?: AbortSignal,
): Promise<T | null> {
	let response: Response;
	try {
		response = await fetch(OPENROUTER_API_URL + path, {
			method: "POST",
			headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
			body: JSON.stringify(await body),
			signal,
		});
	} catch (error) {
		throw new ConflictError(`OpenRouter に接続できません: ${(error as Error).message}`);
	}
	const answer = (await response.json().catch(() => null)) as
		| (T & { error?: { message?: string } | string })
		| null;
	if (!response.ok) {
		const detail = typeof answer?.error === "string" ? answer.error : answer?.error?.message;
		throw new ConflictError(`OpenRouter: ${detail ?? `${response.status} ${response.statusText}`}`);
	}
	return answer;
}
