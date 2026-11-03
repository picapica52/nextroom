// When a routine runs next, in this PC's local time. Every trigger but a one-off and an interval is
// a cron expression (minute hour day-of-month month day-of-week), with `*`, lists, ranges and
// steps; when both days are given, either one matches, as in cron.

import type { Routine, RoutineTrigger } from "@nextroom/contracts";

interface Field {
	min: number;
	max: number;
}

const FIELDS: Field[] = [
	{ min: 0, max: 59 },
	{ min: 0, max: 23 },
	{ min: 1, max: 31 },
	{ min: 1, max: 12 },
	{ min: 0, max: 7 },
];

interface Cron {
	minutes: Set<number>;
	hours: Set<number>;
	days: Set<number>;
	months: Set<number>;
	weekdays: Set<number>;
	anyDay: boolean;
	anyWeekday: boolean;
}

function parseField(text: string, { min, max }: Field): Set<number> {
	const out = new Set<number>();
	for (const part of text.split(",")) {
		const [range, stepText] = part.split("/");
		const step = stepText === undefined ? 1 : Number(stepText);
		let from = min;
		let to = max;
		if (range !== "*") {
			const [a, b] = (range ?? "").split("-");
			from = Number(a);
			to = b === undefined ? (stepText === undefined ? from : max) : Number(b);
		}
		if (
			![from, to, step].every(Number.isInteger) ||
			step < 1 ||
			from < min ||
			to > max ||
			from > to
		)
			throw new Error(`cron の値が正しくありません: ${part}`);
		for (let n = from; n <= to; n += step) out.add(n);
	}
	return out;
}

function parseCron(expression: string): Cron {
	const parts = expression.trim().split(/\s+/);
	if (parts.length !== 5) throw new Error("cron は「分 時 日 月 曜日」の5つで書いてください");
	const [minutes, hours, days, months, weekdays] = parts.map((p, i) =>
		parseField(p, FIELDS[i] as Field),
	) as [Set<number>, Set<number>, Set<number>, Set<number>, Set<number>];
	if (weekdays.has(7)) weekdays.add(0);
	return {
		minutes,
		hours,
		days,
		months,
		weekdays,
		anyDay: parts[2] === "*",
		anyWeekday: parts[4] === "*",
	};
}

function dayMatches(cron: Cron, date: Date): boolean {
	const day = cron.days.has(date.getDate());
	const weekday = cron.weekdays.has(date.getDay());
	if (cron.anyDay && cron.anyWeekday) return true;
	if (cron.anyDay) return weekday;
	if (cron.anyWeekday) return day;
	return day || weekday;
}

/** The first time after `after` (seconds) that the expression matches; null when none comes
 *  within about five years. */
function nextCron(expression: string, after: number): number | null {
	const cron = parseCron(expression);
	const date = new Date(Math.floor(after / 60) * 60_000 + 60_000);
	const limit = after * 1000 + 5 * 366 * 24 * 60 * 60_000;
	while (date.getTime() <= limit) {
		if (!cron.months.has(date.getMonth() + 1)) {
			date.setMonth(date.getMonth() + 1, 1);
			date.setHours(0, 0, 0, 0);
		} else if (!dayMatches(cron, date)) {
			date.setDate(date.getDate() + 1);
			date.setHours(0, 0, 0, 0);
		} else if (!cron.hours.has(date.getHours())) {
			date.setHours(date.getHours() + 1, 0, 0, 0);
		} else if (!cron.minutes.has(date.getMinutes())) {
			date.setMinutes(date.getMinutes() + 1, 0, 0);
		} else {
			return date.getTime() / 1000;
		}
	}
	return null;
}

const hm = (time: string) => time.split(":").map(Number) as [number, number];

/** The trigger as a cron expression; null for a one-off and an interval. */
function cronOf(trigger: RoutineTrigger): string | null {
	switch (trigger.type) {
		case "hourly":
			return `${trigger.minute} * * * *`;
		case "daily": {
			const [h, m] = hm(trigger.time);
			return `${m} ${h} * * *`;
		}
		case "weekdays": {
			const [h, m] = hm(trigger.time);
			return `${m} ${h} * * 1-5`;
		}
		case "weekly": {
			const [h, m] = hm(trigger.time);
			return `${m} ${h} * * ${trigger.weekday}`;
		}
		case "monthly": {
			const [h, m] = hm(trigger.time);
			return `${m} ${h} ${trigger.day} * *`;
		}
		case "cron":
			return trigger.expression;
		default:
			return null;
	}
}

/** When the routine runs next (seconds); null when it will not (paused, or a past one-off). */
export function nextRunAt(routine: Routine): number | null {
	if (!routine.active) return null;
	const { trigger } = routine;
	const since = routine.last_run_at ?? routine.created_at;
	if (trigger.type === "once") return routine.last_run_at === null ? trigger.at : null;
	if (trigger.type === "interval") return since + trigger.minutes * 60;
	const expression = cronOf(trigger);
	return expression ? nextCron(expression, since) : null;
}

/** Throws when the trigger can never fire as written (a bad cron expression). */
export function checkTrigger(trigger: RoutineTrigger): void {
	const expression = cronOf(trigger);
	if (expression && nextCron(expression, Date.now() / 1000) === null)
		throw new Error("この指定では一度も実行されません");
}
