// How close a character feels to the user: points counted by fixed rules from how the two
// talk (never from what is said), the level they add up to, how much it missed the user, and
// the events the character starts on its own as the two grow closer.

import { z } from "zod";

/** The levels: the points they start at, and the days the two must have talked on and have
 *  known each other for. */
export const AFFINITY_LEVELS = [
	{ level: 1, label: "はじめまして", from: 0, talked_days: 0, known_days: 0 },
	{ level: 2, label: "顔見知り", from: 15, talked_days: 0, known_days: 0 },
	{ level: 3, label: "友達", from: 60, talked_days: 5, known_days: 0 },
	{ level: 4, label: "親しい友達", from: 150, talked_days: 10, known_days: 14 },
	{ level: 5, label: "特別な相手", from: 300, talked_days: 20, known_days: 30 },
] as const;

export type AffinityLevel = (typeof AFFINITY_LEVELS)[number];

export const affinityLevel = (level: number): AffinityLevel =>
	AFFINITY_LEVELS[level - 1] ?? AFFINITY_LEVELS[0];

export const RELATIONSHIPS = ["friend", "lover"] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

/** How an event reaches the user: the character speaks first when the conversation opens, it
 *  brings it up in a reply, or it reads out a letter it wrote (kept to read again). */
export const EVENT_DELIVERIES = ["opening", "reply", "letter"] as const;
export type EventDelivery = (typeof EVENT_DELIVERIES)[number];

/** The kinds of events, with how the screens name them. */
export const AFFINITY_EVENT_LABELS = {
	good_morning: "おはよう / おやすみ",
	season: "季節・行事の話",
	late_night: "夜更かしの心配",
	birthday: "誕生日",
	welcome_back: "おかえり",
	missed_you: "寂しかった",
	first_voice: "初めての声",
	long_time_voice: "久しぶりの声",
	jealousy: "やきもち",
	follow_up: "その後どうなった？",
	celebrate: "お祝い",
	reminisce: "思い出話",
	promise: "約束の確認",
	favorite_talk: "好きなものの話",
	recommend: "おすすめ",
	inside_joke: "二人の合言葉",
	good_work: "お疲れさま",
	rejoice: "一緒に喜ぶ",
	together: "一緒にやってみたいこと",
	ask_name: "呼び方の相談",
	new_name: "呼び方を変えたい",
	anniversary: "記念日",
	thanks: "感謝",
	change_of_heart: "心の変化",
	confide: "打ち明け話",
	secret: "小さな秘密",
	letter: "手紙",
	your_world: "あなたの世界が知りたい",
	show_world: "自分の世界を見せる",
	souvenir: "お土産",
	apart: "会えないもどかしさ",
	noticing: "意識しはじめる",
	type_talk: "好きなタイプの話",
	date: "端末ごしのデート",
	confession: "告白",
	first_as_lovers: "付き合って初めての会話",
	love_you: "不意の「好き」",
	affection: "甘える",
	lovers_anniversary: "恋人の記念日",
	future: "将来の話",
	love_letter: "恋人への手紙",
} as const;
export type AffinityEventKind = keyof typeof AFFINITY_EVENT_LABELS;

/** Something that moved the points beyond talking on a day: an event answered. */
const affinityGainSchema = z.object({
	at: z.number(),
	delta: z.number(),
	reason: z.string(),
});
export type AffinityGain = z.infer<typeof affinityGainSchema>;

/** An event the character started, and what it was about (so it is not repeated). */
const affinityEventSchema = z.object({
	kind: z.string(),
	at: z.number(),
	topic: z.string().default(""),
});

const letterSchema = z.object({ at: z.number(), kind: z.string(), text: z.string() });
export type AffinityLetter = z.infer<typeof letterSchema>;

/** As stored in the character's folder (affinity.json). Dates are the local `YYYY-MM-DD`. */
export const affinitySchema = z.object({
	value: z.number().default(0),
	/** The level reached; it never goes down. */
	level: z.number().default(1),
	/** Exchanges counted so far, the days they were on, and the first, latest and latest one the
	 *  user said aloud. */
	exchanges: z.number().default(0),
	talked_days: z.number().default(0),
	first_at: z.number().nullable().default(null),
	last_at: z.number().nullable().default(null),
	last_voice_at: z.number().nullable().default(null),
	/** Exchanges today, as the first ones of a day count more. */
	today: z.object({ date: z.string(), exchanges: z.number() }).nullable().default(null),
	/** How much the character missed the user (0–100) as of the latest exchange; it grows with
	 *  the days apart. */
	longing: z.number().default(0),
	/** The latest event, until the user says something after it. */
	pending_event: z.object({ kind: z.string(), at: z.number() }).nullable().default(null),
	/** Days the two talked late at night, the latest few. */
	late_dates: z.array(z.string()).default([]),
	/** Tool work today, and how the latest tool work went. */
	work: z
		.object({
			date: z.string(),
			turns: z.number(),
			last: z.enum(["none", "ok", "error"]),
			/** The latest tool work went well after failing before. */
			recovered: z.boolean().default(false),
		})
		.nullable()
		.default(null),
	/** A level reached whose event has not happened yet. */
	level_event: z.number().nullable().default(null),
	/** Newest last. */
	gains: z.array(affinityGainSchema).default([]),
	relationship: z.enum(RELATIONSHIPS).default("friend"),
	lover_since: z.number().nullable().default(null),
	/** The character confessed and waits for the answer (the next exchange). */
	confessed_at: z.number().nullable().default(null),
	events: z.array(affinityEventSchema).default([]),
	letters: z.array(letterSchema).default([]),
});
export type Affinity = z.infer<typeof affinitySchema>;

/** A character's affinity as the API answers it. */
export interface AffinityView {
	value: number;
	level: number;
	label: string;
	/** Where the current level starts, and the next one (null at the top). */
	from: number;
	next: number | null;
	talked_days: number;
	/** Days since the two first talked. */
	known_days: number;
	/** The points are there for the next level, but these days are still to come. */
	waiting: { talked_days: number; known_days: number } | null;
	relationship: Relationship;
	lover_since: number | null;
	/** Newest first. */
	gains: AffinityGain[];
	/** Newest first, with how the screens name them. */
	events: { kind: string; label: string; at: number; topic: string }[];
	/** Newest first. */
	letters: AffinityLetter[];
}

/** A change made by the user: back to friends. */
export const affinityPatchSchema = z.object({ relationship: z.literal("friend") });

/** What a reply carries when it was an event or the level went up with it. */
export const chatAffinityMarkSchema = z.object({
	event: z.object({ kind: z.string(), label: z.string() }).optional(),
	level_up: z.object({ level: z.number(), label: z.string() }).optional(),
});
export type ChatAffinityMark = z.infer<typeof chatAffinityMarkSchema>;
