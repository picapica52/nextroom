// Routines: an instruction a character carries out on its own, at the times its trigger says. The
// result is left in its conversation as a message from the character.

import { z } from "zod";
import { modelChoiceSchema } from "./settings";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "時刻は HH:MM で指定してください");

/** When a routine runs, in this PC's local time. `interval` counts from the last run. */
export const routineTriggerSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("once"), at: z.number() }),
	z.object({ type: z.literal("interval"), minutes: z.number().int().min(5).max(43_200) }),
	z.object({ type: z.literal("hourly"), minute: z.number().int().min(0).max(59) }),
	z.object({ type: z.literal("daily"), time }),
	z.object({ type: z.literal("weekdays"), time }),
	z.object({ type: z.literal("weekly"), time, weekday: z.number().int().min(0).max(6) }),
	z.object({ type: z.literal("monthly"), time, day: z.number().int().min(1).max(31) }),
	z.object({ type: z.literal("cron"), expression: z.string().trim().min(1) }),
]);
export type RoutineTrigger = z.infer<typeof routineTriggerSchema>;
export type RoutineTriggerType = RoutineTrigger["type"];

export const routineSchema = z.object({
	id: z.string(),
	character_id: z.string(),
	name: z.string().trim().min(1).max(80),
	instruction: z.string().trim().min(1).max(4000),
	trigger: routineTriggerSchema,
	/** Null: the character's model. */
	model: modelChoiceSchema.nullable(),
	active: z.boolean(),
	created_by: z.enum(["user", "character"]),
	created_at: z.number(),
	updated_at: z.number(),
	last_run_at: z.number().nullable(),
});
export type Routine = z.infer<typeof routineSchema>;

/** A routine as the API answers it. */
export type RoutineView = Routine & {
	/** Null: it will not run again (a past one-off, or paused). */
	next_run_at: number | null;
	running: boolean;
};

export const routineCreateSchema = routineSchema
	.pick({ character_id: true, name: true, instruction: true, trigger: true })
	.extend({
		model: modelChoiceSchema.nullable().default(null),
		active: z.boolean().default(true),
	});
export type RoutineCreate = z.input<typeof routineCreateSchema>;

export const routinePatchSchema = routineSchema
	.pick({ name: true, instruction: true, trigger: true, model: true, active: true })
	.partial();
export type RoutinePatch = z.infer<typeof routinePatchSchema>;

/** One run of a routine. */
export interface RoutineRun {
	id: string;
	routine_id: string;
	started_at: number;
	finished_at: number | null;
	status: "running" | "done" | "error" | "cancelled" | "skipped";
	/** What the character said, shortened. */
	reply: string;
	error: string | null;
}
