// A character's affinity for the user, kept in its folder as affinity.json and counted by fixed
// rules from how the two talk: each day they talk, each exchange (the first ones of a day count
// more), and answering an event the character started. It never goes down. A level also needs
// enough days talked and known. It is not exported with the character, like its memory, and
// goes when the memory is cleared. The same file keeps how much the character missed the user,
// and what the events need: when the two talked, the relationship, the events so far and the
// letters.

import { rmSync } from "node:fs";
import { join } from "node:path";
import {
	AFFINITY_EVENT_LABELS,
	AFFINITY_LEVELS,
	type Affinity,
	type AffinityEventKind,
	type AffinityView,
	affinityLevel,
	affinitySchema,
} from "@nextroom/contracts";
import { characterDir } from "../characters/paths";
import { now, readJson, writeJson } from "../lib/storage";

const RULES = {
	talkedDay: 3,
	/** The n-th exchange of a day. */
	exchange: (n: number) => (n <= 4 ? 1 : n <= 12 ? 0.5 : 0),
	answeredEvent: 3,
};

/** How much the character's longing grows a day apart, by level, and how much an exchange eases. */
const LONGING_PER_DAY = [0, 4, 8, 12, 16];
const LONGING_EASED = 20;
const LONGING_MAX = 100;

const KEPT_GAINS = 50;
const KEPT_EVENTS = 200;
const KEPT_LATE_DATES = 7;
/** Talks from midnight until this hour are late at night. */
const LATE_UNTIL_HOUR = 4;

const affinityPath = (characterId: string) => join(characterDir(characterId), "affinity.json");

export function loadAffinity(characterId: string): Affinity {
	return readJson(affinityPath(characterId), affinitySchema) ?? affinitySchema.parse({});
}

function saveAffinity(characterId: string, affinity: Affinity): void {
	writeJson(affinityPath(characterId), affinitySchema, affinity);
}

/** Changes the stored affinity with `change`. */
export function updateAffinity(
	characterId: string,
	change: (affinity: Affinity) => void,
): Affinity {
	const affinity = loadAffinity(characterId);
	change(affinity);
	saveAffinity(characterId, affinity);
	return affinity;
}

const pad = (n: number) => String(n).padStart(2, "0");

export const localDate = (date: Date) =>
	`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const DAY = 24 * 60 * 60 * 1000;

/** Whole local days from `at` to `now`. */
export function calendarDays(at: number, now: Date): number {
	const from = new Date(at * 1000);
	const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
	const end = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	return Math.round((end - start) / DAY);
}

const knownDays = (affinity: Affinity, now: Date) =>
	affinity.first_at === null ? 0 : calendarDays(affinity.first_at, now);

/** How much the character missed the user by `now`, 0–100. */
export function longingOf(affinity: Affinity, now: Date): number {
	if (affinity.last_at === null) return 0;
	const perDay = LONGING_PER_DAY[affinity.level - 1] ?? 0;
	return Math.min(LONGING_MAX, affinity.longing + calendarDays(affinity.last_at, now) * perDay);
}

/** The highest level whose points and days the two have. */
function reachedLevel(affinity: Affinity, now: Date): number {
	const known = knownDays(affinity, now);
	return (
		AFFINITY_LEVELS.findLast(
			(l) =>
				affinity.value >= l.from && affinity.talked_days >= l.talked_days && known >= l.known_days,
		)?.level ?? 1
	);
}

const labelOf = (kind: string) => AFFINITY_EVENT_LABELS[kind as AffinityEventKind] ?? kind;

function viewOf(affinity: Affinity): AffinityView {
	const today = new Date();
	const level = affinityLevel(affinity.level);
	const next = AFFINITY_LEVELS.find((l) => l.level === level.level + 1);
	const known = knownDays(affinity, today);
	return {
		value: affinity.value,
		level: level.level,
		label: level.label,
		from: level.from,
		next: next?.from ?? null,
		talked_days: affinity.talked_days,
		known_days: known,
		waiting:
			next && affinity.value >= next.from
				? {
						talked_days: Math.max(next.talked_days - affinity.talked_days, 0),
						known_days: Math.max(next.known_days - known, 0),
					}
				: null,
		relationship: affinity.relationship,
		lover_since: affinity.lover_since,
		gains: [...affinity.gains].reverse(),
		events: affinity.events.map((e) => ({ ...e, label: labelOf(e.kind) })).reverse(),
		letters: [...affinity.letters].reverse(),
	};
}

export const getAffinity = (characterId: string) => viewOf(loadAffinity(characterId));

export interface ExchangeResult {
	/** The level reached with this exchange, if it went up. */
	levelUp: { level: number; label: string } | null;
}

/** One exchange with the character finished: `spoken` when the user said it aloud, `tools`
 *  how the reply's tool work went, `startedEvent` when the reply started an event (which the
 *  user's next words answer, not these). */
export function recordExchange(
	characterId: string,
	spoken: boolean,
	tools: "none" | "ok" | "error",
	startedEvent: boolean,
): ExchangeResult {
	const affinity = loadAffinity(characterId);
	const at = now();
	const when = new Date(at * 1000);
	const date = localDate(when);
	const before = affinity.level;
	const add = (delta: number, reason: string | null) => {
		if (delta <= 0) return;
		affinity.value += delta;
		if (reason) affinity.gains.push({ at, delta, reason });
	};

	affinity.longing = Math.max(longingOf(affinity, when) - LONGING_EASED, 0);
	const today = affinity.today?.date === date ? affinity.today : { date, exchanges: 0 };
	if (!today.exchanges) {
		affinity.talked_days += 1;
		add(RULES.talkedDay, null);
	}
	today.exchanges += 1;
	add(RULES.exchange(today.exchanges), null);
	affinity.today = today;
	const pending = affinity.pending_event;
	if (pending && !startedEvent) {
		if (localDate(new Date(pending.at * 1000)) === date)
			add(RULES.answeredEvent, `「${labelOf(pending.kind)}」に応えた`);
		affinity.pending_event = null;
	}

	affinity.exchanges += 1;
	affinity.first_at ??= at;
	affinity.last_at = at;
	if (spoken) affinity.last_voice_at = at;
	if (when.getHours() < LATE_UNTIL_HOUR && !affinity.late_dates.includes(date))
		affinity.late_dates = [...affinity.late_dates, date].slice(-KEPT_LATE_DATES);
	const work =
		affinity.work?.date === date
			? affinity.work
			: { date, turns: 0, last: "none" as const, recovered: false };
	if (tools !== "none") {
		work.recovered = tools === "ok" && work.last === "error";
		work.turns += 1;
		work.last = tools;
	}
	affinity.work = work;

	const after = Math.max(before, reachedLevel(affinity, when));
	affinity.level = after;
	if (after > before) affinity.level_event = after;
	affinity.gains = affinity.gains.slice(-KEPT_GAINS);
	saveAffinity(characterId, affinity);
	return {
		levelUp: after > before ? { level: after, label: affinityLevel(after).label } : null,
	};
}

/** An event happened: it counts against how often its kind may come again, and waits for the
 *  user to answer it. `levelEvent` when it was the event of the level just reached; `letter` the
 *  letter it read out. */
export function recordEvent(
	characterId: string,
	event: { kind: string; topic: string; levelEvent: boolean; letter?: string },
) {
	updateAffinity(characterId, (affinity) => {
		const at = now();
		affinity.events = [...affinity.events, { kind: event.kind, at, topic: event.topic }].slice(
			-KEPT_EVENTS,
		);
		affinity.pending_event = { kind: event.kind, at };
		if (event.levelEvent) affinity.level_event = null;
		if (event.letter) affinity.letters.push({ at, kind: event.kind, text: event.letter });
		if (event.kind === "confession") affinity.confessed_at = at;
	});
}

/** The user's answer to a confession: lovers, or friends as before (nothing is lost). */
export function answerConfession(characterId: string, accepted: boolean): void {
	updateAffinity(characterId, (affinity) => {
		affinity.confessed_at = null;
		if (accepted) {
			affinity.relationship = "lover";
			affinity.lover_since = now();
		}
	});
}

/** Back to friends, as the user asked. */
export function backToFriends(characterId: string): AffinityView {
	return viewOf(
		updateAffinity(characterId, (affinity) => {
			affinity.relationship = "friend";
			affinity.lover_since = null;
			affinity.confessed_at = null;
		}),
	);
}

/** Back to the start, as when the two first met. */
export function resetAffinity(characterId: string): AffinityView {
	rmSync(affinityPath(characterId), { force: true });
	return getAffinity(characterId);
}
