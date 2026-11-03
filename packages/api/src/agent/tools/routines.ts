// Routines the character sets up when the user asks, in the conversation: "wake me at 7 every
// morning", "remind me in 20 minutes", "check the news every evening". When the time comes, the
// character is asked to do it and its message waits in the conversation (agent/routines).

import { z } from "zod";
import type { AgentSettings } from "../../settings/agent";
import { stamp } from "../memory/context";
import { createRoutine, deleteRoutine, getRoutine, listRoutines } from "../routines";
import { defineTool, type ToolSet } from "../tool";

const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/;

/** `YYYY-MM-DD HH:MM` in local time, as seconds. */
function secondsOf(text: string): number {
	const m = LOCAL_TIME.exec(text.trim());
	if (!m) throw new Error("Write the time as YYYY-MM-DD HH:MM.");
	const [, y, mo, d, h, mi] = m.map(Number) as number[];
	return new Date(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0).getTime() / 1000;
}

const time = z
	.string()
	.regex(/^([01]\d|2[0-3]):[0-5]\d$/)
	.describe("HH:MM, 24-hour, local time.");

const when = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("once"),
		at: z.string().describe("When, as YYYY-MM-DD HH:MM in local time."),
	}),
	z.object({
		type: z.literal("interval"),
		minutes: z.number().int().min(5).describe("Every this many minutes (5 or more)."),
	}),
	z.object({ type: z.literal("hourly"), minute: z.number().int().min(0).max(59) }),
	z.object({ type: z.literal("daily"), time }),
	z.object({ type: z.literal("weekdays"), time }),
	z.object({
		type: z.literal("weekly"),
		time,
		weekday: z.number().int().min(0).max(6).describe("0 is Sunday, 6 is Saturday."),
	}),
	z.object({ type: z.literal("monthly"), time, day: z.number().int().min(1).max(31) }),
]);

const scheduleRoutine = defineTool({
	name: "schedule_routine",
	description: [
		"Set up something to do on your own at a set time or regularly, when the user asks for it: wake them, remind them, check something every morning.",
		"When the time comes you will be asked to do it, and what you say then waits in the conversation for the user. Use the current time you are given to work out the date.",
	].join("\n"),
	schema: z.object({
		name: z.string().min(1).max(80).describe("A short name, in Japanese."),
		instruction: z
			.string()
			.min(1)
			.describe(
				"What to do each time, written so that you can do it then without this conversation.",
			),
		when,
	}),
	changes: true,
	execute: async ({ name, instruction, when: w }, call) => {
		const trigger = w.type === "once" ? { type: "once" as const, at: secondsOf(w.at) } : w;
		const routine = createRoutine(
			{ character_id: call.context.characterId, name, instruction, trigger },
			"character",
		);
		const next = routine.next_run_at;
		return `Set up "${routine.name}" (id ${routine.id}).${next ? ` It runs next at ${stamp(next)}.` : ""}`;
	},
});

const listRoutinesTool = defineTool({
	name: "list_routines",
	description: "The routines you have: what each does and when it runs next.",
	schema: z.object({}),
	execute: async (_input, call) => {
		const routines = listRoutines(call.context.characterId);
		if (!routines.length) return "You have no routines.";
		return routines.map((r) => ({
			id: r.id,
			name: r.name,
			instruction: r.instruction,
			active: r.active,
			next_run: r.next_run_at ? stamp(r.next_run_at) : null,
		}));
	},
});

const cancelRoutine = defineTool({
	name: "cancel_routine",
	description: "Cancel one of your routines, when the user asks.",
	schema: z.object({ id: z.string().describe("The routine's id, from list_routines.") }),
	changes: true,
	execute: async ({ id }, call) => {
		const routine = getRoutine(id);
		if (routine.character_id !== call.context.characterId)
			return "That is not one of your routines.";
		deleteRoutine(id);
		return `Cancelled "${routine.name}".`;
	},
});

/** The routine tools, when the agent settings turn them on. */
export function routineTools(settings: AgentSettings): ToolSet {
	if (!settings.routines.enabled) return {};
	return Object.fromEntries(
		[scheduleRoutine, listRoutinesTool, cancelRoutine].map((t) => [t.name, t]),
	);
}
