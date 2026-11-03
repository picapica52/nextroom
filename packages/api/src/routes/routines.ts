import {
	type RoutineRun,
	type RoutineView,
	routineCreateSchema,
	routinePatchSchema,
} from "@nextroom/contracts";
import { Hono } from "hono";
import { z } from "zod";
import {
	createRoutine,
	deleteRoutine,
	getRoutine,
	listRoutines,
	routineRuns,
	runRoutine,
	updateRoutine,
} from "../agent/routines";
import { getCharacter } from "../characters/store";
import { ConflictError } from "../lib/errors";
import { json, ok, query } from "./inputs";

/** A character's routines (`?character_id=`), and each routine by id. */
export const routinesRouter = new Hono()
	.get("/", query(z.object({ character_id: z.string() })), (c) => {
		const characterId = c.req.valid("query").character_id;
		getCharacter(characterId);
		return c.json<RoutineView[]>(listRoutines(characterId));
	})
	.post("/", json(routineCreateSchema), (c) => {
		const input = c.req.valid("json");
		getCharacter(input.character_id);
		return c.json<RoutineView>(createRoutine(input, "user"));
	})
	.get("/:id", (c) => c.json<RoutineView>(getRoutine(c.req.param("id"))))
	.patch("/:id", json(routinePatchSchema), (c) =>
		c.json<RoutineView>(updateRoutine(c.req.param("id"), c.req.valid("json"))),
	)
	.delete("/:id", (c) => {
		deleteRoutine(c.req.param("id"));
		return c.json(ok);
	})
	// Runs it now (テスト実行).
	.post("/:id/run", (c) => {
		if (!runRoutine(c.req.param("id")))
			throw new ConflictError(
				"キャラクターが別の返答の途中です。終わってからもう一度試してください",
			);
		return c.json<RoutineView>(getRoutine(c.req.param("id")));
	})
	.get("/:id/runs", (c) => c.json<RoutineRun[]>(routineRuns(c.req.param("id"))));
