// Small JSON persistence helpers. Reads and writes are synchronous so that a
// read-modify-write never interleaves with another request. Both check the data against
// its schema, so a hand-edited or outdated file fails here rather than somewhere later.

import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { prettifyError, type z } from "zod";

export const newId = (prefix = "") => `${prefix}${randomBytes(5).toString("hex")}`;

/** `name` without the characters Windows forbids in file names (each as `_`) and without
 *  leading or trailing spaces and dots. */
export const safeFileName = (name: string) =>
	// biome-ignore lint/suspicious/noControlCharactersInRegex: Windows forbids them in file names
	name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/^[ .]+|[ .]+$/g, "");

/** Seconds since the epoch, as the stored files have always kept time. */
export const now = () => Date.now() / 1000;

function check<S extends z.ZodType>(path: string, schema: S, data: unknown): z.output<S> {
	const parsed = schema.safeParse(data);
	if (!parsed.success)
		throw new Error(`${path} の形式が正しくありません\n${prettifyError(parsed.error)}`);
	return parsed.data;
}

export function readJson<S extends z.ZodType>(path: string, schema: S): z.output<S> | null {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
	return check(path, schema, JSON.parse(text));
}

export function writeJson<S extends z.ZodType>(path: string, schema: S, data: z.input<S>): void {
	const checked = check(path, schema, data);
	mkdirSync(dirname(path), { recursive: true });
	const tmp = `${path}.tmp`;
	writeFileSync(tmp, JSON.stringify(checked, null, 1), "utf8");
	renameSync(tmp, path);
}
