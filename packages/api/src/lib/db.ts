// The app's database, _data/nextroom.sqlite (bun:sqlite). Most of what the app keeps is a document
// checked against its zod schema, kept by key in a table of its own:
//
//     settings        by section (chat, agent, discord)
//     characters      by character id: persona, voice, expressions, neutral
//     affinity        by character id
//     chat_sessions   by character id: when the conversation was made and last changed
//     voice_refs      by character id: the Voice Clone clips (their files stay in the folder)
//     voice_files     by character id: what is known about the voice file
//     credentials     by pi's provider id: the subscriptions signed in to
//
// The characters' memory has tables of its own (agent/memory/db.ts). Images, audio and the
// workspaces stay files in the characters' folders.

import { Database } from "bun:sqlite";
import { join } from "node:path";
import { prettifyError, type z } from "zod";
import { dataDir } from "./config";

export const DOC_TABLES = [
	"settings",
	"characters",
	"affinity",
	"chat_sessions",
	"voice_refs",
	"voice_files",
	"credentials",
] as const;
export type DocTable = (typeof DOC_TABLES)[number];

/** Tables other modules make on first use, run once the database is open. */
const schemas: string[] = DOC_TABLES.map(
	(t) => `CREATE TABLE IF NOT EXISTS ${t} (key TEXT PRIMARY KEY, data TEXT NOT NULL)`,
);

export const dbFile = () => join(dataDir(), "nextroom.sqlite");

let db: Database | null = null;

export function appDb(): Database {
	if (db) return db;
	db = new Database(dbFile(), { create: true, strict: true });
	db.run("PRAGMA journal_mode = WAL");
	db.run("PRAGMA foreign_keys = ON");
	for (const sql of schemas) db.run(sql);
	return db;
}

/** Adds tables to make; made at once when the database is already open. */
export function defineTables(sql: string): void {
	schemas.push(sql);
	db?.run(sql);
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
	const row = appDb()
		.query<{ data: string }, [string]>(`SELECT data FROM ${table} WHERE key = ?`)
		.get(key);
	return row ? check(`${table}/${key}`, schema, JSON.parse(row.data)) : null;
}

export function writeDoc<S extends z.ZodType>(
	table: DocTable,
	key: string,
	schema: S,
	data: z.input<S>,
): void {
	const checked = check(`${table}/${key}`, schema, data);
	appDb().run(
		`INSERT INTO ${table} (key, data) VALUES (?, ?)
		 ON CONFLICT (key) DO UPDATE SET data = excluded.data`,
		[key, JSON.stringify(checked)],
	);
}

export function deleteDoc(table: DocTable, key: string): void {
	appDb().run(`DELETE FROM ${table} WHERE key = ?`, [key]);
}

export const hasDoc = (table: DocTable, key: string) =>
	!!appDb().query(`SELECT 1 FROM ${table} WHERE key = ?`).get(key);

/** Every document of the table that fits the schema; those that do not are left out. */
export function listDocs<S extends z.ZodType>(
	table: DocTable,
	schema: S,
): { key: string; data: z.output<S> }[] {
	return appDb()
		.query<{ key: string; data: string }, []>(`SELECT key, data FROM ${table}`)
		.all()
		.flatMap((row) => {
			const parsed = schema.safeParse(JSON.parse(row.data));
			if (!parsed.success) {
				console.warn(`Skipped ${table}/${row.key}: ${prettifyError(parsed.error)}`);
				return [];
			}
			return [{ key: row.key, data: parsed.data }];
		});
}
