// Web search through Exa's API (its `instant` search, made for chat and voice), so the character
// can look things up without opening a search engine in the browser, which blocks it as a bot.
// It answers with the top results' titles, URLs and highlights; the browser can open a URL
// when the page needs reading in full.

import type { ToolsInput } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AgentSettings } from "../../settings/agent";
import { exaApiKey } from "../../settings/chat";
import { NO_EXA_KEY, NO_RESULTS, SEARCH_UNREADABLE, searchFailed } from "../prompts";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const NUM_RESULTS = 10;
const HIGHLIGHT_CHARS = 500;
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

const webSearch = createTool({
	id: "web_search",
	description:
		"Search the web and get the top results: title, URL, published date and the passages that match. " +
		"Write the query the way you would type it into a search engine.",
	inputSchema: z.object({
		query: z.string().min(1).describe("What to search for."),
	}),
	execute: async ({ query }, context) => {
		const apiKey = exaApiKey();
		if (!apiKey) return NO_EXA_KEY;
		const response = await fetch(EXA_SEARCH_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json", "x-api-key": apiKey },
			body: JSON.stringify({
				query,
				type: "instant",
				numResults: NUM_RESULTS,
				contents: { highlights: { maxCharacters: HIGHLIGHT_CHARS } },
			}),
			signal: context?.abortSignal
				? AbortSignal.any([context.abortSignal, AbortSignal.timeout(TIMEOUT_MS)])
				: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!response.ok) {
			const detail = (await response.text().catch(() => "")).slice(0, 300);
			return searchFailed(response.status, detail);
		}
		const answer = exaAnswerSchema.safeParse(await response.json().catch(() => null));
		if (!answer.success) return SEARCH_UNREADABLE;
		const results = answer.data.results ?? [];
		if (!results.length) return NO_RESULTS;
		return results.map((r) => ({
			title: r.title ?? "",
			url: r.url,
			published: r.publishedDate?.slice(0, 10) ?? null,
			highlights: r.highlights ?? [],
		}));
	},
});

/** The web search tool, when the agent settings turn it on. */
export function webSearchTools(settings: AgentSettings): ToolsInput {
	return settings.web_search.enabled ? { [webSearch.id]: webSearch } : {};
}
