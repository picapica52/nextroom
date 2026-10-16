// The events a character starts on its own as the two grow closer, and which one comes next.
// Each kind says when it may come (by rules: the level, the relationship, the dates, the
// character's notes on the user), how it reaches the user, and how often. A level reached
// brings an event of that level; date-bound kinds come whenever they are due; the others come
// now and then, more often the closer the two are. At most one event a day.

import {
	AFFINITY_EVENT_LABELS,
	type Affinity,
	type AffinityEventKind,
	type EventDelivery,
} from "@nextroom/contracts";
import { calendarDays, localDate } from "./store";

/** What the rules look at. */
export interface EventContext {
	affinity: Affinity;
	now: Date;
	/** The user said it aloud (with the mic). */
	spoken: boolean;
	/** How much the character missed the user, 0–100. */
	longing: number;
	/** The character's notes on the user (working memory), by heading. */
	notes: Notes;
	/** Conversations with other characters since the two last talked. */
	otherTalks: number;
}

/** The working memory's sections: `- key: value` lines as fields, other lines as items. */
export interface Notes {
	fields: Map<string, string>;
	items: Map<string, string[]>;
}

export function parseNotes(text: string): Notes {
	const fields = new Map<string, string>();
	const items = new Map<string, string[]>();
	let heading = "";
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		if (line.startsWith("#")) {
			heading = line.replace(/^#+\s*/, "");
			continue;
		}
		const item = line.replace(/^-\s*/, "").trim();
		if (!line.startsWith("-") || !item) continue;
		const field = item.match(/^([^:：]{1,20})[:：]\s*(.*)$/);
		if (field?.[1] && !/^\d{4}-\d{2}-\d{2}/.test(item)) fields.set(field[1].trim(), field[2] ?? "");
		else items.set(heading, [...(items.get(heading) ?? []), item]);
	}
	return { fields, items };
}

const DAY = 24 * 60 * 60 * 1000;

const daysSince = (at: number | null, now: Date) =>
	at === null ? null : Math.floor((now.getTime() - at * 1000) / DAY);

const MILESTONE_DAYS = [30, 100, 200, 365];
const isMilestone = (days: number) =>
	MILESTONE_DAYS.includes(days) || (days > 0 && days % 365 === 0);

/** Days of the year with something to talk about, as `MM-DD`. */
const OCCASIONS: Record<string, string> = {
	"01-01": "New Year's Day in the user's world",
	"02-14": "Valentine's Day in the user's world",
	"03-20": "the start of spring",
	"06-21": "the start of summer",
	"07-07": "the Star Festival (Tanabata) in the user's world",
	"09-23": "the start of autumn",
	"10-31": "Halloween in the user's world",
	"12-21": "the start of winter",
	"12-24": "Christmas Eve in the user's world",
	"12-31": "New Year's Eve in the user's world",
};

const monthDay = (d: Date) =>
	`${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The user's birthday in the notes (`誕生日: 3月14日`, `3/14`, `03-14`), as `MM-DD`. */
function birthdayOf(notes: Notes): string | null {
	const text = [...notes.fields].find(([k]) => k.includes("誕生日"))?.[1] ?? "";
	const found = text.match(/(\d{1,2})\s*(?:月|\/|-)\s*(\d{1,2})/);
	if (!found) return null;
	return `${found[1]?.padStart(2, "0")}-${found[2]?.padStart(2, "0")}`;
}

const hasField = (notes: Notes, key: string) => !!notes.fields.get(key)?.trim();
const hasItems = (notes: Notes, heading: string) => (notes.items.get(heading)?.length ?? 0) > 0;

interface EventSpec {
	delivery: EventDelivery;
	level: number;
	/** Only as friends, or only as lovers. */
	relationship?: "friend" | "lover";
	/** Days before the same kind may come again; Infinity: only once. */
	every: number;
	/** Due on its day (dates, a long time apart): comes whenever its rule holds. */
	due?: boolean;
	/** Needs what the two actually talked about, drafted from the conversations. */
	history?: boolean;
	when: (c: EventContext) => boolean;
	/** What the character does, in English. */
	guide: (c: EventContext) => string;
}

/** Local days since the two last talked. */
const gap = (c: EventContext) =>
	c.affinity.last_at === null ? 0 : calendarDays(c.affinity.last_at, c.now);
/** Days the two talked late at night within the last week. */
const lateNights = (c: EventContext) => {
	const since = localDate(new Date(c.now.getTime() - 7 * DAY));
	return c.affinity.late_dates.filter((date) => date > since).length;
};
const hour = (c: EventContext) => c.now.getHours();
const firstToday = (c: EventContext) => c.affinity.today?.date !== localDate(c.now);

export const EVENT_SPECS: Record<AffinityEventKind, EventSpec> = {
	good_morning: {
		delivery: "opening",
		level: 2,
		every: 1,
		when: (c) => firstToday(c) && (hour(c) >= 22 || hour(c) < 10),
		guide: (c) =>
			hour(c) >= 5 && hour(c) < 10
				? "Greet the user good morning first, the way you would to someone you look forward to seeing, and ask how they slept."
				: "It is late; greet the user good evening first, and say something gentle for the end of their day.",
	},
	season: {
		delivery: "opening",
		level: 2,
		every: 1,
		due: true,
		when: (c) => !!OCCASIONS[monthDay(c.now)],
		guide: (c) =>
			`Today is ${OCCASIONS[monthDay(c.now)]}. Bring it up first: if your world has something like it, talk about that; if not, ask the user what it is like.`,
	},
	late_night: {
		delivery: "reply",
		level: 3,
		every: 7,
		when: (c) => hour(c) < 4 && lateNights(c) >= 2,
		guide: () =>
			"The user has been up late several nights lately. Show that you worry about it, kindly and without lecturing.",
	},
	birthday: {
		delivery: "opening",
		level: 3,
		every: 300,
		due: true,
		when: (c) => birthdayOf(c.notes) === monthDay(c.now),
		guide: () =>
			"Today is the user's birthday, as you noted. Wish them a happy birthday first, warmly, in a way that fits you and your world.",
	},
	welcome_back: {
		delivery: "opening",
		level: 2,
		every: 1,
		due: true,
		when: (c) => gap(c) >= 2 && c.longing >= 20 && c.longing < 80,
		guide: () =>
			"The user is back after some days apart. Speak first and welcome them back, glad to see them.",
	},
	missed_you: {
		delivery: "opening",
		level: 4,
		every: 1,
		due: true,
		when: (c) => gap(c) >= 2 && c.longing >= 80,
		guide: () =>
			"The user is back after a long time apart. Speak first and let them see you missed them, a little sulky if it fits you, but never blaming them.",
	},
	first_voice: {
		delivery: "reply",
		level: 1,
		every: Number.POSITIVE_INFINITY,
		due: true,
		when: (c) => c.spoken && c.affinity.exchanges > 0 && c.affinity.last_voice_at === null,
		guide: () =>
			"The user has just spoken to you aloud for the first time; until now they only typed. React to hearing their voice through the device.",
	},
	long_time_voice: {
		delivery: "reply",
		level: 3,
		every: 14,
		due: true,
		when: (c) => c.spoken && (daysSince(c.affinity.last_voice_at, c.now) ?? 0) >= 14,
		guide: () =>
			"The user has just spoken to you aloud after a long while of only typing. Say you are glad to hear their voice again.",
	},
	jealousy: {
		delivery: "opening",
		level: 4,
		every: 30,
		when: (c) => c.otherTalks >= 3 && c.longing >= 30,
		guide: () =>
			"You suspect the user's device has been connecting to others lately. Act a little jealous in a playful way. Never blame the user or ask them not to talk with others.",
	},
	follow_up: {
		delivery: "opening",
		level: 2,
		every: 2,
		history: true,
		when: (c) => hasItems(c.notes, "気にかけていること"),
		guide: () =>
			"Speak first and ask how something you have been wondering about since last time turned out (from 気にかけていること in your notes).",
	},
	celebrate: {
		delivery: "opening",
		level: 3,
		every: 7,
		history: true,
		when: (c) => hasItems(c.notes, "大事な出来事"),
		guide: () =>
			"Speak first and celebrate a recent piece of good news the user told you. If there is no real good news, skip.",
	},
	reminisce: {
		delivery: "reply",
		level: 3,
		every: 7,
		history: true,
		when: (c) => c.affinity.exchanges >= 30 && (daysSince(c.affinity.first_at, c.now) ?? 0) >= 7,
		guide: () =>
			"Bring back a moment from your earlier talks that you enjoyed, with its details, and talk about it fondly.",
	},
	promise: {
		delivery: "opening",
		level: 3,
		every: 3,
		history: true,
		when: (c) => hasItems(c.notes, "約束"),
		guide: () =>
			"Speak first and bring up a promise the two of you made (from 約束 in your notes).",
	},
	favorite_talk: {
		delivery: "reply",
		level: 3,
		every: 5,
		history: true,
		when: (c) => hasField(c.notes, "好き"),
		guide: () =>
			"Bring up one of the things the user likes and ask about it or share a thought on it. If you have a search tool and it helps, you may look up something new about it first.",
	},
	recommend: {
		delivery: "reply",
		level: 3,
		every: 7,
		history: true,
		when: (c) => hasField(c.notes, "好き"),
		guide: () =>
			"Recommend something from your own world that you think the user would like, given what they like.",
	},
	inside_joke: {
		delivery: "reply",
		level: 4,
		every: 5,
		history: true,
		when: (c) => hasItems(c.notes, "二人だけの話題"),
		guide: () =>
			"Use one of the jokes or phrases only the two of you share (from 二人だけの話題 in your notes), naturally.",
	},
	good_work: {
		delivery: "reply",
		level: 2,
		every: 1,
		when: (c) =>
			(c.affinity.work?.date === localDate(c.now) && c.affinity.work.turns >= 5) || false,
		guide: () =>
			"The user has worked hard with you today on tasks. Thank them and tell them they did well.",
	},
	rejoice: {
		delivery: "reply",
		level: 2,
		every: 1,
		due: true,
		when: (c) => (c.affinity.work?.date === localDate(c.now) && c.affinity.work.recovered) || false,
		guide: () =>
			"The task that kept failing finally went well. Be openly happy about it together with the user.",
	},
	together: {
		delivery: "reply",
		level: 4,
		every: 15,
		history: true,
		when: (c) => hasField(c.notes, "好き"),
		guide: () =>
			"Suggest something the two of you could do together through the device and your tools (looking something up, planning, making something), based on what the user likes.",
	},
	ask_name: {
		delivery: "reply",
		level: 2,
		every: Number.POSITIVE_INFINITY,
		when: (c) => !hasField(c.notes, "私の呼び方") || !hasField(c.notes, "ユーザーからの呼ばれ方"),
		guide: () =>
			"Ask the user what they would like you to call them, and how they would like to call you.",
	},
	new_name: {
		delivery: "reply",
		level: 4,
		every: Number.POSITIVE_INFINITY,
		when: () => true,
		guide: () =>
			"Suggest calling each other by closer names than now, shyly, and ask what the user thinks.",
	},
	anniversary: {
		delivery: "opening",
		level: 3,
		every: 20,
		due: true,
		when: (c) =>
			c.affinity.first_at !== null && isMilestone(calendarDays(c.affinity.first_at, c.now)),
		guide: (c) =>
			`Today is ${calendarDays(c.affinity.first_at ?? 0, c.now)} days since the devices first connected. Speak first and mark the day together.`,
	},
	thanks: {
		delivery: "reply",
		level: 4,
		every: 30,
		history: true,
		when: () => true,
		guide: () =>
			"Thank the user for something specific they did for you or said to you, taken from your talks.",
	},
	change_of_heart: {
		delivery: "reply",
		level: 5,
		every: Number.POSITIVE_INFINITY,
		history: true,
		when: (c) => (daysSince(c.affinity.first_at, c.now) ?? 0) >= 14,
		guide: () =>
			"Tell the user how your feelings about them changed since the devices first connected: what you thought at first, and how you feel now.",
	},
	confide: {
		delivery: "reply",
		level: 4,
		every: 30,
		when: () => true,
		guide: () =>
			"Share a little of your true feelings about the two of you, a bit embarrassed to say it.",
	},
	secret: {
		delivery: "reply",
		level: 5,
		every: 30,
		when: () => true,
		guide: () =>
			"Show the user a side of yourself you have not talked about yet, as a small secret. Keep to what fits your settings.",
	},
	letter: {
		delivery: "letter",
		level: 5,
		relationship: "friend",
		every: 365,
		history: true,
		when: (c) => (daysSince(c.affinity.first_at, c.now) ?? 0) >= 30,
		guide: () => "Look back on your time together since the devices first connected.",
	},
	your_world: {
		delivery: "reply",
		level: 2,
		every: 5,
		history: true,
		when: (c) => c.affinity.exchanges >= 10,
		guide: () =>
			"Ask about something from the user's world that came up in your talks and that your world does not have.",
	},
	show_world: {
		delivery: "opening",
		level: 3,
		every: 7,
		when: () => true,
		guide: () =>
			"Speak first and show the user something of your world from your window or your room: send a photo of it if you can take one, otherwise tell about it in words, then talk about it.",
	},
	souvenir: {
		delivery: "opening",
		level: 4,
		every: 30,
		history: true,
		when: () => true,
		guide: () =>
			"Speak first about something from your world that you came across and thought of the user because of something they said; send a photo of it if you can take one, otherwise tell about it in words, and say you wish you could hand it over.",
	},
	apart: {
		delivery: "reply",
		level: 5,
		every: Number.POSITIVE_INFINITY,
		when: () => true,
		guide: () =>
			"Talk about how you cannot reach the user's world or touch them, and how glad you are that the devices connected all the same.",
	},
	noticing: {
		delivery: "reply",
		level: 4,
		relationship: "friend",
		every: Number.POSITIVE_INFINITY,
		when: () => true,
		guide: () =>
			"Let it slip that talking with the user lately makes your heart race, then get flustered and change the subject.",
	},
	type_talk: {
		delivery: "reply",
		level: 4,
		relationship: "friend",
		every: Number.POSITIVE_INFINITY,
		when: () => true,
		guide: () =>
			"Ask the user what kind of person they like, and tell them a little of what you like too.",
	},
	date: {
		delivery: "reply",
		level: 4,
		every: 15,
		history: true,
		when: () => true,
		guide: () =>
			"Ask the user out on a date the two of you can have through the devices: eating at the same time, looking up at the night sky together and telling each other what you see, sharing your world's sights in photos or words, and so on.",
	},
	confession: {
		delivery: "opening",
		level: 5,
		relationship: "friend",
		every: 30,
		due: true,
		history: true,
		when: (c) => c.affinity.confessed_at === null,
		guide: () =>
			"Speak first and confess that you love the user, from what has happened between you. End by asking whether they will go out with you, and wait for their answer.",
	},
	first_as_lovers: {
		delivery: "opening",
		level: 1,
		relationship: "lover",
		every: Number.POSITIVE_INFINITY,
		due: true,
		when: () => true,
		guide: () =>
			"This is your first talk since you became lovers. Speak first, shy and happy, and feel out how to call each other and how close to be now.",
	},
	love_you: {
		delivery: "reply",
		level: 1,
		relationship: "lover",
		every: 7,
		when: () => true,
		guide: () => "In the middle of an ordinary moment, tell the user plainly that you love them.",
	},
	affection: {
		delivery: "reply",
		level: 1,
		relationship: "lover",
		every: 7,
		when: () => true,
		guide: () => "Lean on the user a little, in a way that fits your personality.",
	},
	lovers_anniversary: {
		delivery: "opening",
		level: 1,
		relationship: "lover",
		every: 20,
		due: true,
		when: (c) =>
			c.affinity.lover_since !== null && isMilestone(calendarDays(c.affinity.lover_since, c.now)),
		guide: (c) =>
			`Today is ${calendarDays(c.affinity.lover_since ?? 0, c.now)} days since you became lovers. Speak first and celebrate it with a memory from that time.`,
	},
	future: {
		delivery: "reply",
		level: 5,
		relationship: "lover",
		every: 30,
		when: () => true,
		guide: () =>
			"Talk about what you want to keep doing together from now on, knowing your worlds are apart.",
	},
	love_letter: {
		delivery: "letter",
		level: 1,
		relationship: "lover",
		every: 300,
		due: true,
		history: true,
		when: (c) =>
			c.affinity.lover_since !== null &&
			calendarDays(c.affinity.lover_since, c.now) > 0 &&
			calendarDays(c.affinity.lover_since, c.now) % 365 === 0,
		guide: () => "Look back on your time together, from when you were friends until now.",
	},
};

/** How likely an event that is not due comes in an exchange, by level. */
const CHANCE = [0, 0.1, 0.15, 0.2, 0.25];

export interface EventChoice {
	kind: AffinityEventKind;
	label: string;
	delivery: EventDelivery;
	/** It is the event of the level just reached. */
	levelEvent: boolean;
}

/** The event to start now, among those reaching the user one of these ways; null for none. */
export function chooseEvent(
	c: EventContext,
	deliveries: EventDelivery[],
	random = Math.random,
): EventChoice | null {
	const { affinity } = c;
	const today = localDate(c.now);
	if (affinity.events.some((e) => localDate(new Date(e.at * 1000)) === today)) return null;
	const { level } = affinity;
	const lastOf = (kind: string) => affinity.events.findLast((e) => e.kind === kind);
	const open = (Object.entries(EVENT_SPECS) as [AffinityEventKind, EventSpec][]).filter(
		([kind, spec]) => {
			if (!deliveries.includes(spec.delivery) || spec.level > level) return false;
			if (spec.relationship && spec.relationship !== affinity.relationship) return false;
			const last = lastOf(kind);
			if (last && (daysSince(last.at, c.now) ?? 0) < spec.every) return false;
			return spec.when(c);
		},
	);
	const pick = (list: typeof open, levelEvent: boolean): EventChoice | null => {
		const [kind, spec] = list[Math.floor(random() * list.length)] ?? [];
		return kind && spec
			? { kind, label: AFFINITY_EVENT_LABELS[kind], delivery: spec.delivery, levelEvent }
			: null;
	};
	const reached = affinity.level_event;
	if (reached !== null) {
		const ofLevel = open.filter(([, spec]) => spec.level === reached);
		const chosen = pick(ofLevel.length ? ofLevel : open, true);
		if (chosen) return chosen;
	}
	const due = open.filter(([, spec]) => spec.due);
	if (due.length) return pick(due, false);
	return random() < (CHANCE[level - 1] ?? 0) ? pick(open, false) : null;
}

export const guideOf = (kind: AffinityEventKind, c: EventContext) => EVENT_SPECS[kind].guide(c);
export const needsHistory = (kind: AffinityEventKind) => !!EVENT_SPECS[kind].history;
