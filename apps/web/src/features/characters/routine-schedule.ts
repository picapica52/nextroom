import type { RoutineRun, RoutineTrigger, RoutineTriggerType } from "@nextroom/contracts";
import type { DotTone } from "@/components/status";

export const TRIGGER_LABELS: Record<RoutineTriggerType, string> = {
	daily: "毎日",
	weekdays: "平日",
	weekly: "毎週",
	monthly: "毎月",
	hourly: "毎時",
	interval: "一定の間隔",
	once: "一度だけ",
	cron: "cron 式",
};

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

export const RUN_STATUS: Record<RoutineRun["status"], { label: string; tone: DotTone }> = {
	running: { label: "実行中", tone: "info" },
	done: { label: "完了", tone: "success" },
	error: { label: "エラー", tone: "destructive" },
	cancelled: { label: "中止", tone: "muted" },
	skipped: { label: "スキップ", tone: "muted" },
};

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026/11/03 15:00", in this PC's time. Input is a Unix time in seconds. */
export function formatDateTime(ts: number): string {
	const d = new Date(ts * 1000);
	return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "今日 15:00", "明日 7:00", or "11/5（水）7:00". */
export function formatNext(ts: number): string {
	const d = new Date(ts * 1000);
	const hm = `${d.getHours()}:${pad(d.getMinutes())}`;
	const day = new Date();
	if (d.toDateString() === day.toDateString()) return `今日 ${hm}`;
	day.setDate(day.getDate() + 1);
	if (d.toDateString() === day.toDateString()) return `明日 ${hm}`;
	return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）${hm}`;
}

function intervalText(minutes: number): string {
	if (minutes % 1440 === 0) return `${minutes / 1440}日ごと`;
	if (minutes % 60 === 0) return minutes === 60 ? "1時間ごと" : `${minutes / 60}時間ごと`;
	return `${minutes}分ごと`;
}

/** The trigger in words, e.g. "毎日 07:00" or "毎週 月曜 09:00". */
export function scheduleText(t: RoutineTrigger): string {
	switch (t.type) {
		case "once":
			return `一度だけ ${formatDateTime(t.at)}`;
		case "interval":
			return intervalText(t.minutes);
		case "hourly":
			return `1時間ごと（毎時 ${t.minute}分）`;
		case "daily":
			return `毎日 ${t.time}`;
		case "weekdays":
			return `平日 ${t.time}`;
		case "weekly":
			return `毎週 ${WEEKDAYS[t.weekday]}曜 ${t.time}`;
		case "monthly":
			return `毎月 ${t.day}日 ${t.time}`;
		case "cron":
			return `cron ${t.expression}`;
	}
}

/** A time in seconds as a datetime-local input's value. */
export function toLocalInput(ts: number): string {
	const d = new Date(ts * 1000);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
