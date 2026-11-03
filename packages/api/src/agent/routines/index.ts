// Routines: instructions a character carries out on its own at the times their trigger says
// (Settings of the character → ルーティン, or set up by the character in the conversation). Each is
// a document of the database's `routines` table, and each run is a row of `routine_runs`. A run is
// a turn of the character's conversation that the user did not start (conversations/turn.ts):
// what the character says is left there for the user to read.
//
// The scheduler looks for due routines every half a minute. A character busy with another turn
// runs its routine once that turn is over. A recurring routine missed by more than an hour (the
// app was not running) is skipped to its next time; a one-off still runs.

import {
	type Routine,
	type RoutineCreate,
	type RoutinePatch,
	type RoutineRun,
	type RoutineView,
	routineCreateSchema,
	routineSchema,
} from "@nextroom/contracts";
import { appDb, defineTables, deleteDoc, listDocs, readDoc, writeDoc } from "../../lib/db";
import { BadRequestError, messageOf, NotFoundError, parseOrBadRequest } from "../../lib/errors";
import { newId, now } from "../../lib/storage";
import { checkTrigger, nextRunAt } from "./schedule";

defineTables(`
CREATE TABLE IF NOT EXISTS routine_runs (
	id TEXT PRIMARY KEY,
	routine_id TEXT NOT NULL,
	started_at REAL NOT NULL,
	finished_at REAL,
	status TEXT NOT NULL,
	reply TEXT NOT NULL,
	error TEXT
);
CREATE INDEX IF NOT EXISTS routine_runs_routine ON routine_runs (routine_id, started_at);
`);

const TICK_MS = 30_000;
const MISSED_AFTER_SECONDS = 60 * 60;
const KEPT_RUNS = 50;
const REPLY_CHARS = 500;

/** Starts one run of the routine: a turn of its character's conversation. Null while the
 *  character is busy with another turn. */
export type RunStarter = (routine: Routine) => {
	finished: Promise<{ status: RoutineRun["status"]; reply: string; error: string | null }>;
} | null;

let starter: RunStarter | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const running = new Set<string>();

const loadRoutine = (id: string): Routine => {
	const routine = readDoc("routines", id, routineSchema);
	if (!routine) throw new NotFoundError("ルーティンが見つかりません");
	return routine;
};

const save = (routine: Routine) => writeDoc("routines", routine.id, routineSchema, routine);

const viewOf = (routine: Routine): RoutineView => ({
	...routine,
	next_run_at: nextRunAt(routine),
	running: running.has(routine.id),
});

/** A character's routines, the soonest first. */
export function listRoutines(characterId: string): RoutineView[] {
	return listDocs("routines", routineSchema)
		.map((d) => d.data)
		.filter((r) => r.character_id === characterId)
		.map(viewOf)
		.sort((a, b) => (a.next_run_at ?? Infinity) - (b.next_run_at ?? Infinity));
}

export const getRoutine = (id: string) => viewOf(loadRoutine(id));

function checked(trigger: Routine["trigger"]) {
	try {
		checkTrigger(trigger);
	} catch (error) {
		throw new BadRequestError(messageOf(error));
	}
}

export function createRoutine(input: RoutineCreate, by: Routine["created_by"]): RoutineView {
	const data = parseOrBadRequest(routineCreateSchema, input);
	checked(data.trigger);
	const at = now();
	const routine: Routine = {
		...data,
		id: newId("rt_"),
		created_by: by,
		created_at: at,
		updated_at: at,
		last_run_at: null,
	};
	save(routine);
	return viewOf(routine);
}

export function updateRoutine(id: string, patch: RoutinePatch): RoutineView {
	const current = loadRoutine(id);
	const next = parseOrBadRequest(routineSchema, { ...current, ...patch, updated_at: now() });
	if (patch.trigger) {
		checked(next.trigger);
		// A new time starts counting from now, so a past one-off may be set again.
		next.last_run_at = null;
		next.created_at = now();
	}
	save(next);
	return viewOf(next);
}

export function deleteRoutine(id: string): void {
	loadRoutine(id);
	deleteDoc("routines", id);
	appDb().run(`DELETE FROM routine_runs WHERE routine_id = ?`, [id]);
}

export function deleteRoutinesOf(characterId: string): void {
	for (const r of listRoutines(characterId)) deleteRoutine(r.id);
}

/** The routine's runs, the newest first. */
export function routineRuns(id: string): RoutineRun[] {
	return appDb()
		.query<RoutineRun, [string, number]>(
			`SELECT id, routine_id, started_at, finished_at, status, reply, error FROM routine_runs
			 WHERE routine_id = ? ORDER BY started_at DESC LIMIT ?`,
		)
		.all(id, KEPT_RUNS);
}

function recordRun(run: RoutineRun): void {
	appDb().run(
		`INSERT INTO routine_runs (id, routine_id, started_at, finished_at, status, reply, error)
		 VALUES (?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT (id) DO UPDATE SET finished_at = excluded.finished_at, status = excluded.status,
		 reply = excluded.reply, error = excluded.error`,
		[run.id, run.routine_id, run.started_at, run.finished_at, run.status, run.reply, run.error],
	);
	appDb().run(
		`DELETE FROM routine_runs WHERE routine_id = ?1 AND id NOT IN
		 (SELECT id FROM routine_runs WHERE routine_id = ?1 ORDER BY started_at DESC LIMIT ?2)`,
		[run.routine_id, KEPT_RUNS],
	);
}

/** Runs the routine now; false while its character is busy (or it is already running). */
export function runRoutine(id: string): boolean {
	const routine = loadRoutine(id);
	if (running.has(id) || !starter) return false;
	const started = starter(routine);
	if (!started) return false;
	const run: RoutineRun = {
		id: newId("run_"),
		routine_id: id,
		started_at: now(),
		finished_at: null,
		status: "running",
		reply: "",
		error: null,
	};
	running.add(id);
	recordRun(run);
	save({ ...routine, last_run_at: run.started_at });
	void started.finished
		.then((outcome) => ({ ...outcome, reply: outcome.reply.slice(0, REPLY_CHARS) }))
		.catch((error) => ({ status: "error" as const, reply: "", error: messageOf(error) }))
		.then((outcome) => recordRun({ ...run, ...outcome, finished_at: now() }))
		.finally(() => running.delete(id));
	return true;
}

function tick(): void {
	const at = now();
	for (const { data: routine } of listDocs("routines", routineSchema)) {
		const due = nextRunAt(routine);
		if (due === null || due > at || running.has(routine.id)) continue;
		if (routine.trigger.type !== "once" && at - due > MISSED_AFTER_SECONDS) {
			save({ ...routine, last_run_at: at });
			recordRun({
				id: newId("run_"),
				routine_id: routine.id,
				started_at: at,
				finished_at: at,
				status: "skipped",
				reply: "",
				error: "アプリが動いていなかったため、この回は実行しませんでした",
			});
			continue;
		}
		try {
			runRoutine(routine.id);
		} catch (error) {
			console.warn(`Could not run the routine ${routine.id}:`, error);
		}
	}
}

/** Starts looking for due routines; `start` runs one (conversations/turn.ts). */
export function startRoutines(start: RunStarter): void {
	starter = start;
	if (timer) clearInterval(timer);
	timer = setInterval(tick, TICK_MS);
	setTimeout(tick, 5_000);
}
