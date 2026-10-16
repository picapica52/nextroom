// A topic to talk about, found when the user asks the character to say something. It searches
// Exa twice at once: something recent about one of the user's interests, and something new
// from a field picked at random, so the user also hears about things they did not know.
// Nothing is kept but the URLs given lately, so the same story does not come back.

import type { ToolsInput } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AgentSettings } from "../../settings/agent";
import { exaApiKey } from "../../settings/chat";
import { NO_EXA_KEY, NO_TOPICS, SEARCH_UNREADABLE, searchFailed, TOPICS_NOTE } from "../prompts";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const NUM_RESULTS = 6;
const PER_SLOT = 2;
const HIGHLIGHT_CHARS = 400;
const TIMEOUT_MS = 30_000;
const INTEREST_DAYS = 7;
const NEW_DAYS = 30;
const KEPT_URLS = 60;

const FIELDS = [
	{ field: "科学", query: "科学の新しい発見" },
	{ field: "宇宙", query: "宇宙の新しい発見" },
	{ field: "生き物", query: "動物や生き物の新しい発見" },
	{ field: "歴史", query: "歴史の新しい発見や発掘" },
	{ field: "食べ物", query: "食べ物の話題" },
	{ field: "テクノロジー", query: "新しい技術の話題" },
	{ field: "地理と旅", query: "世界の珍しい場所の話題" },
	{ field: "アート", query: "アートや展覧会の話題" },
	{ field: "言葉", query: "言葉や語源の話題" },
	{ field: "スポーツ", query: "スポーツの話題" },
	{ field: "健康", query: "健康に関する新しい研究" },
	{ field: "音楽", query: "音楽の話題" },
];

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

interface Slot {
	kind: "interest" | "new";
	about: string;
	query: string;
	days: number;
}

interface Topic {
	kind: Slot["kind"];
	about: string;
	title: string;
	summary: string;
	url: string;
	published: string | null;
}

const recentUrls: string[] = [];

function remember(urls: string[]) {
	recentUrls.push(...urls);
	recentUrls.splice(0, Math.max(0, recentUrls.length - KEPT_URLS));
}

function pickFields(count: number) {
	return [...FIELDS].sort(() => Math.random() - 0.5).slice(0, count);
}

async function search(slot: Slot, apiKey: string, abortSignal?: AbortSignal) {
	const since = new Date(Date.now() - slot.days * 24 * 60 * 60 * 1000).toISOString();
	const response = await fetch(EXA_SEARCH_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json", "x-api-key": apiKey },
		body: JSON.stringify({
			query: slot.query,
			type: "instant",
			numResults: NUM_RESULTS,
			startPublishedDate: since,
			contents: { highlights: { maxCharacters: HIGHLIGHT_CHARS } },
		}),
		signal: abortSignal
			? AbortSignal.any([abortSignal, AbortSignal.timeout(TIMEOUT_MS)])
			: AbortSignal.timeout(TIMEOUT_MS),
	});
	if (!response.ok) {
		const detail = (await response.text().catch(() => "")).slice(0, 300);
		throw new Error(searchFailed(response.status, detail));
	}
	const answer = exaAnswerSchema.safeParse(await response.json().catch(() => null));
	if (!answer.success) throw new Error(SEARCH_UNREADABLE);
	return (answer.data.results ?? [])
		.filter((r) => !recentUrls.includes(r.url) && r.highlights?.length)
		.slice(0, PER_SLOT)
		.map(
			(r): Topic => ({
				kind: slot.kind,
				about: slot.about,
				title: r.title ?? "",
				summary: (r.highlights ?? []).join(" "),
				url: r.url,
				published: r.publishedDate?.slice(0, 10) ?? null,
			}),
		);
}

const findTopic = createTool({
	id: "find_topic",
	description:
		"Recall a few things you came across on your phone lately, to talk about. " +
		"Use it only when the user asks you to say something or to bring up a topic.",
	inputSchema: z.object({
		interest: z
			.string()
			.optional()
			.describe(
				"One thing the user likes, from your notes on them, in a few words. Leave it out when you know none.",
			),
	}),
	execute: async ({ interest }, context) => {
		const apiKey = exaApiKey();
		if (!apiKey) return NO_EXA_KEY;
		const liked = interest?.trim();
		const fields = pickFields(liked ? 1 : 2);
		const slots: Slot[] = [
			...(liked
				? [
						{
							kind: "interest" as const,
							about: liked,
							query: `${liked}の最近の話題`,
							days: INTEREST_DAYS,
						},
					]
				: []),
			...fields.map((f) => ({
				kind: "new" as const,
				about: f.field,
				query: f.query,
				days: NEW_DAYS,
			})),
		];
		const settled = await Promise.allSettled(
			slots.map((slot) => search(slot, apiKey, context?.abortSignal)),
		);
		const topics = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
		if (!topics.length) {
			const failed = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
			return failed ? String(failed.reason?.message ?? failed.reason) : NO_TOPICS;
		}
		remember(topics.map((t) => t.url));
		return { topics, note: TOPICS_NOTE };
	},
});

/** The topic tool, when the agent settings turn it on. */
export function findTopicTools(settings: AgentSettings): ToolsInput {
	return settings.topic_search.enabled ? { [findTopic.id]: findTopic } : {};
}
