import { existsSync, statSync } from "node:fs";

import { movedWorkspaceEntrySchema, workspacePathSchema } from "@nextroom/contracts";
import { Hono } from "hono";
import { z } from "zod";
import { BadRequestError, NotFoundError } from "../lib/errors";
import {
	createWorkspaceFolder,
	deleteWorkspaceEntry,
	listWorkspaceFiles,
	moveWorkspaceEntry,
	saveWorkspaceFiles,
	workspaceFile,
} from "../workspaces/store";
import { json, ok, query, sendFile } from "./inputs";

const pathQuery = query(z.object({ path: z.string().default("") }));

/** The files of each character's workspace, by the character's id. */
export const workspacesRouter = new Hono()
	.get("/:id/files", (c) => c.json(listWorkspaceFiles(c.req.param("id"))))
	.get("/:id/download", pathQuery, (c) => {
		const path = workspaceFile(c.req.param("id"), c.req.valid("query").path);
		if (!existsSync(path) || statSync(path).isDirectory())
			throw new NotFoundError("ファイルがありません");
		return sendFile(path);
	})
	// Uploads: `files` with their `paths` (relative, folders kept), saved under `dir`.
	.post("/:id/files", async (c) => {
		const form = await c.req.parseBody({ all: true });
		const files = [form.files].flat().filter((f): f is File => f instanceof File);
		const paths = [form.paths].flat().map(String);
		if (!files.length || files.length !== paths.length)
			throw new BadRequestError("files と paths を同じ数だけ送ってください");
		const dir = typeof form.dir === "string" ? form.dir : "";
		await saveWorkspaceFiles(
			c.req.param("id"),
			dir,
			files.map((file, i) => ({ file, path: paths[i] ?? file.name })),
		);
		return c.json(ok);
	})
	.post("/:id/folders", json(workspacePathSchema), (c) => {
		createWorkspaceFolder(c.req.param("id"), c.req.valid("json").path);
		return c.json(ok);
	})
	.post("/:id/move", json(movedWorkspaceEntrySchema), (c) => {
		const { from, to } = c.req.valid("json");
		moveWorkspaceEntry(c.req.param("id"), from, to);
		return c.json(ok);
	})
	.delete("/:id/files", pathQuery, (c) => {
		deleteWorkspaceEntry(c.req.param("id"), c.req.valid("query").path);
		return c.json(ok);
	});
