// The app's database, _data/nextroom.sqlite (bun:sqlite through Drizzle; the tables are in
// schema.ts, the migrations in packages/api/drizzle). Most of what the app keeps is a document
// checked against its zod schema, kept by key in a table of its own:
//
//     settings        by section (chat, agent, discord, slack)
//     characters      by character id: persona, voice, agent
//     affinity        by character id
//     chat_sessions   by character id: when the conversation was made and last changed
//     voice_refs      by character id: the Voice Clone clips (their files stay in the folder)
//     voice_files     by character id: what is known about the voice file
//     credentials     by pi's provider id: the API keys entered and the sign-ins
//     routines        by routine id: what a character carries out on its own, and when
//
// The characters' memory has tables of its own (agent/memory). Images and audio stay files
// in the characters' folders; the workspaces are in the characters' computers.

import { Database } from "bun:sqlite";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { prettifyError, type z } from "zod";
import { dataDir } from "./config";
import * as schema from "./schema";

const docTables = {
	settings: schema.settings,
	characters: schema.characters,
	affinity: schema.affinity,
	chat_sessions: schema.chatSessions,
	voice_refs: schema.voiceRefs,
	voice_files: schema.voiceFiles,
	credentials: schema.credentials,
	routines: schema.routines,
};
export type DocTable = keyof typeof docTables;

export type AppDb = BunSQLiteDatabase<typeof schema>;

const migrationsFolder = join(import.meta.dir, "../../drizzle");

let db: AppDb | null = null;

export function appDb(): AppDb {
	if (db) return db;
	const client = new Database(join(dataDir(), "nextroom.sqlite"), { create: true, strict: true });
	client.run("PRAGMA journal_mode = WAL");
	client.run("PRAGMA foreign_keys = ON");
	db = drizzle({ client, schema });
	migrate(db, { migrationsFolder });
	return db;
}

function check<S extends z.ZodType>(where: string, schema: S, data: unknown): z.output<S> {
	const parsed = schema.safeParse(data);
	if (!parsed.success)
		throw new Error(`${where} の形式が正しくありません\n${prettifyError(parsed.error)}`);
	return parsed.data;
}

export function readDoc<S extends z.ZodType>(
	table: DocTable,
	key: string,
	schema: S,
): z.output<S> | null {
	const t = docTables[table];
	const row = appDb().select({ data: t.data }).from(t).where(eq(t.key, key)).get();
	return row ? check(`${table}/${key}`, schema, JSON.parse(row.data)) : null;
}

export function writeDoc<S extends z.ZodType>(
	table: DocTable,
	key: string,
	schema: S,
	data: z.input<S>,
): void {
	const t = docTables[table];
	const json = JSON.stringify(check(`${table}/${key}`, schema, data));
	appDb()
		.insert(t)
		.values({ key, data: json })
		.onConflictDoUpdate({ target: t.key, set: { data: json } })
		.run();
}

export function deleteDoc(table: DocTable, key: string): void {
	const t = docTables[table];
	appDb().delete(t).where(eq(t.key, key)).run();
}

export function hasDoc(table: DocTable, key: string): boolean {
	const t = docTables[table];
	return !!appDb().select({ key: t.key }).from(t).where(eq(t.key, key)).get();
}

/** Every document of the table, unchecked. */
export function rawDocs(table: DocTable): { key: string; data: unknown }[] {
	return appDb()
		.select()
		.from(docTables[table])
		.all()
		.map((row) => ({ key: row.key, data: JSON.parse(row.data) }));
}

/** Every document of the table that fits the schema; those that do not are left out. */
export function listDocs<S extends z.ZodType>(
	table: DocTable,
	schema: S,
): { key: string; data: z.output<S> }[] {
	return rawDocs(table).flatMap((row) => {
		const parsed = schema.safeParse(row.data);
		if (!parsed.success) {
			console.warn(`Skipped ${table}/${row.key}: ${prettifyError(parsed.error)}`);
			return [];
		}
		return [{ key: row.key, data: parsed.data }];
	});
}
