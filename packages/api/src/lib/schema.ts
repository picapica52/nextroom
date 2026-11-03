// The tables of the app's database (db.ts). After changing them, run `bun run db:generate` in
// packages/api to write the migration that brings an existing database up to date.

import type { RoutineRun } from "@nextroom/contracts";
import {
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	unique,
} from "drizzle-orm/sqlite-core";

const docTable = <N extends string>(name: N) =>
	sqliteTable(name, {
		key: text().primaryKey(),
		data: text().notNull(),
	});

export const settings = docTable("settings");
export const characters = docTable("characters");
export const affinity = docTable("affinity");
export const chatSessions = docTable("chat_sessions");
export const voiceRefs = docTable("voice_refs");
export const voiceFiles = docTable("voice_files");
export const credentials = docTable("credentials");
export const routines = docTable("routines");

export const messages = sqliteTable(
	"messages",
	{
		id: text().primaryKey(),
		characterId: text("character_id").notNull(),
		seq: integer().notNull(),
		at: real().notNull(),
		role: text().notNull(),
		message: text().notNull(),
		chat: text(),
	},
	(t) => [unique().on(t.characterId, t.seq)],
);

export const summaries = sqliteTable(
	"summaries",
	{
		id: text().primaryKey(),
		characterId: text("character_id").notNull(),
		at: real().notNull(),
		untilId: text("until_id").notNull(),
		text: text().notNull(),
	},
	(t) => [index("summaries_character").on(t.characterId, t.at)],
);

export const notes = sqliteTable("notes", {
	characterId: text("character_id").primaryKey(),
	content: text().notNull(),
	revision: integer().notNull(),
	updatedAt: real("updated_at").notNull(),
});

export const noteRevisions = sqliteTable(
	"note_revisions",
	{
		characterId: text("character_id").notNull(),
		revision: integer().notNull(),
		content: text().notNull(),
		source: text().notNull(),
		createdAt: real("created_at").notNull(),
	},
	(t) => [primaryKey({ columns: [t.characterId, t.revision] })],
);

export const instructionRevisions = sqliteTable(
	"instruction_revisions",
	{
		characterId: text("character_id").notNull(),
		revision: integer().notNull(),
		instructions: text().notNull(),
		createdAt: real("created_at").notNull(),
	},
	(t) => [primaryKey({ columns: [t.characterId, t.revision] })],
);

export const routineRuns = sqliteTable(
	"routine_runs",
	{
		id: text().primaryKey(),
		routineId: text("routine_id").notNull(),
		startedAt: real("started_at").notNull(),
		finishedAt: real("finished_at"),
		status: text().$type<RoutineRun["status"]>().notNull(),
		reply: text().notNull(),
		error: text(),
	},
	(t) => [index("routine_runs_routine").on(t.routineId, t.startedAt)],
);
