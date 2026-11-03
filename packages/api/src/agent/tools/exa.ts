// Exa's search API (its `instant` search, made for chat and voice), for web_search and find_topic.

import { z } from "zod";
import { SEARCH_UNREADABLE, searchFailed } from "../prompts";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const TIMEOUT_MS = 30_000;

const exaAnswerSchema = z.looseObject({
	results: z
		.array(
			z.looseObject({
				title: z.string().nullish(),
				url: z.string(),
				publishedDate: z.string().nullish(),
				highlights: z.array(z.string()).nullish(),
			}),
		)
		.nullish(),
});

type ExaResult = NonNullable<z.output<typeof exaAnswerSchema>["results"]>[number];

/** The results of a search, or what to tell the agent when it failed. */
export async function exaSearch(
	apiKey: string,
	search: { query: string; numResults: number; highlightChars: number; since?: string },
	signal?: AbortSignal,
): Promise<{ results: ExaResult[] } | { error: string }> {
	const timeout = AbortSignal.timeout(TIMEOUT_MS);
	const response = await fetch(EXA_SEARCH_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-api-key": apiKey },
		body: JSON.stringify({
			query: search.query,
			type: "instant",
			numResults: search.numResults,
			startPublishedDate: search.since,
			contents: { highlights: { maxCharacters: search.highlightChars } },
		}),
		signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
	});
	if (!response.ok) {
		const detail = (await response.text().catch(() => "")).slice(0, 300);
		return { error: searchFailed(response.status, detail) };
	}
	const answer = exaAnswerSchema.safeParse(await response.json().catch(() => null));
	if (!answer.success) return { error: SEARCH_UNREADABLE };
	return { results: answer.data.results ?? [] };
}
