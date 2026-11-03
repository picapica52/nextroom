// Web search through Exa's API (its `instant` search, made for chat and voice), so the character
// can look things up without opening a search engine in the browser, which blocks it as a bot.
// It answers with the top results' titles, URLs and highlights; the browser can open a URL
// when the page needs reading in full.

import { z } from "zod";
import type { AgentSettings } from "../../settings/agent";
import { exaApiKey } from "../../settings/chat";
import { NO_EXA_KEY, NO_RESULTS } from "../prompts";
import { defineTool, type ToolSet } from "../tool";
import { exaSearch } from "./exa";

const NUM_RESULTS = 10;
const HIGHLIGHT_CHARS = 500;

const webSearch = defineTool({
	name: "web_search",
	description:
		"Search the web and get the top results: title, URL, published date and the passages that match. " +
		"Write the query the way you would type it into a search engine.",
	schema: z.object({
		query: z.string().min(1).describe("What to search for."),
	}),
	execute: async ({ query }, call) => {
		const apiKey = exaApiKey();
		if (!apiKey) return NO_EXA_KEY;
		const answer = await exaSearch(
			apiKey,
			{ query, numResults: NUM_RESULTS, highlightChars: HIGHLIGHT_CHARS },
			call.signal,
		);
		if ("error" in answer) return answer.error;
		const { results } = answer;
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
export function webSearchTools(settings: AgentSettings): ToolSet {
	return settings.web_search.enabled ? { [webSearch.name]: webSearch } : {};
}
