// The file side of the character's workspace tools: paths the model gives, resolved inside the
// workspace and nowhere else, and the listing and search the tools answer with.

import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Glob } from "bun";

/** Where commands in the container see the workspace. */
export const MOUNT = "/workspace";

const MAX_LIST_ENTRIES = 1000;
const MAX_GREP_MATCHES = 200;
const MAX_GREP_FILE_BYTES = 1024 * 1024;
const MAX_LINE_CHARS = 300;

const isInside = (root: string, path: string) => {
	const rel = relative(root, path);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

/** `path` with its symlinks followed, as far as it exists; the rest is appended as written. */
async function realOf(path: string): Promise<string> {
	try {
		return await realpath(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		const parent = dirname(path);
		if (parent === path) return path;
		return join(await realOf(parent), basename(path));
	}
}

/** The file on this PC for a path the model gave: relative to the workspace, or under
 *  /workspace as commands see it. Throws when it (or a symlink on the way) leads outside.
 *  With `keepLink`, a symlink at the end is the entry itself, so deleting it keeps its target. */
export async function resolveInside(root: string, path: string, keepLink = false): Promise<string> {
	const given = path.trim() || ".";
	const posix = given.replaceAll("\\", "/");
	let full: string;
	if (posix === MOUNT || posix.startsWith(`${MOUNT}/`))
		full = resolve(root, `.${posix.slice(MOUNT.length)}`);
	else full = resolve(root, given);
	const realRoot = await realpath(root);
	const real = keepLink ? join(await realOf(dirname(full)), basename(full)) : await realOf(full);
	if (!isInside(root, full) && !isInside(realRoot, full))
		throw new Error(`${path} is outside the workspace.`);
	if (full !== root && !isInside(realRoot, real))
		throw new Error(`${path} leads outside the workspace.`);
	return full;
}

/** `full` as the model sees it: relative to the workspace, with forward slashes. */
export const displayPath = (root: string, full: string) =>
	relative(root, full).split(sep).join("/") || ".";

const isBinary = (bytes: Uint8Array) => bytes.subarray(0, 8000).includes(0);

export interface ReadOptions {
	offset?: number;
	limit?: number;
	showLineNumbers: boolean;
	encoding?: "utf-8" | "base64" | "hex";
}

const MAX_READ_CHARS = 100_000;

/** A file's text (a line range, numbered like "     1→"), its bytes encoded, or for a binary
 *  file only what it is. */
export async function readWorkspaceFile(
	root: string,
	full: string,
	options: ReadOptions,
): Promise<string> {
	const info = await stat(full);
	if (info.isDirectory()) throw new Error(`${displayPath(root, full)} is a directory.`);
	const bytes = await readFile(full);
	if (options.encoding === "base64" || options.encoding === "hex") {
		const encoded = bytes.toString(options.encoding);
		return encoded.length > MAX_READ_CHARS
			? `${encoded.slice(0, MAX_READ_CHARS)}\n[truncated: ${bytes.length} bytes in all]`
			: encoded;
	}
	if (isBinary(bytes)) {
		const type = Bun.file(full).type.split(";")[0];
		return `${displayPath(root, full)} is a binary file (${type}, ${bytes.length} bytes). Pass encoding "base64" or "hex" to see its bytes.`;
	}
	const lines = bytes.toString("utf-8").split(/\r?\n/);
	const start = (options.offset ?? 1) - 1;
	const end = options.limit ? start + options.limit : lines.length;
	const picked = lines.slice(start, end);
	const text = (
		options.showLineNumbers
			? picked.map((line, i) => `${String(start + i + 1).padStart(6)}→${line}`)
			: picked
	).join("\n");
	if (text.length <= MAX_READ_CHARS) return text;
	return `${text.slice(0, MAX_READ_CHARS)}\n[truncated: the file has ${lines.length} lines; read the rest with offset/limit]`;
}

export interface ListOptions {
	maxDepth: number;
	showHidden: boolean;
	dirsOnly: boolean;
	exclude?: string;
	extension?: string;
	pattern?: string | string[];
}

/** A tab-indented tree of `dir`, directories ending in "/". */
export async function listWorkspace(root: string, dir: string, options: ListOptions) {
	const info = await stat(dir);
	if (!info.isDirectory()) throw new Error(`${displayPath(root, dir)} is not a directory.`);
	const patterns = [options.pattern ?? []].flat().map((p) => new Glob(p));
	const exclude = options.exclude ? new Glob(options.exclude) : null;
	const filtering = patterns.length > 0 || Boolean(options.extension);
	const counts = { dirs: 0, files: 0, listed: 0 };

	const keepFile = (rel: string, name: string) =>
		(!options.extension || name.endsWith(options.extension)) &&
		(patterns.length === 0 || patterns.some((g) => g.match(rel)));

	async function walk(path: string, depth: number): Promise<string[]> {
		const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
		entries.sort((a, b) => a.name.localeCompare(b.name));
		const lines: string[] = [];
		for (const entry of entries) {
			if (counts.listed >= MAX_LIST_ENTRIES) break;
			const name = entry.name;
			if (!options.showHidden && name.startsWith(".")) continue;
			if (exclude && (exclude.match(name) || name === options.exclude)) continue;
			const full = join(path, name);
			const rel = relative(dir, full).split(sep).join("/");
			const indent = "\t".repeat(depth);
			if (entry.isDirectory()) {
				const inner = depth + 1 < options.maxDepth ? await walk(full, depth + 1) : [];
				if (filtering && inner.length === 0) continue;
				counts.dirs++;
				counts.listed++;
				lines.push(`${indent}${name}/`, ...inner);
			} else if (!options.dirsOnly && keepFile(rel, name)) {
				counts.files++;
				counts.listed++;
				lines.push(`${indent}${name}`);
			}
		}
		return lines;
	}

	const lines = await walk(dir, 0);
	const more = counts.listed >= MAX_LIST_ENTRIES ? " (stopped there; list a narrower path)" : "";
	return [
		`${displayPath(root, dir)}/`,
		...lines.map((line) => `\t${line}`),
		`${counts.dirs} directories, ${counts.files} files${more}`,
	].join("\n");
}

export interface GrepOptions {
	pattern: string;
	path: string;
	contextLines: number;
	maxCount?: number;
	caseSensitive: boolean;
	includeHidden: boolean;
}

const GLOB_CHARS = /[*?[{]/;

/** The files to search for `path`: a file, every file under a directory, or a glob's matches. */
async function filesToSearch(root: string, path: string, includeHidden: boolean) {
	const segments = path.replaceAll("\\", "/").split("/");
	const globAt = segments.findIndex((s) => GLOB_CHARS.test(s));
	const base = await resolveInside(root, globAt < 0 ? path : segments.slice(0, globAt).join("/"));
	if (globAt < 0 && (await stat(base)).isFile()) return [base];
	const glob = new Glob(globAt < 0 ? "**/*" : segments.slice(globAt).join("/"));
	const realRoot = await realpath(root);
	const files: string[] = [];
	for await (const rel of glob.scan({ cwd: base, dot: includeHidden, onlyFiles: true })) {
		const full = join(base, rel);
		if (!isInside(realRoot, await realOf(full))) continue;
		files.push(full);
	}
	return files.sort();
}

/** Matching lines as "path:line:text" (context lines as "path-line-text"). */
export async function grepWorkspace(root: string, options: GrepOptions): Promise<string> {
	const regex = new RegExp(options.pattern, options.caseSensitive ? "" : "i");
	const out: string[] = [];
	let matches = 0;
	let files = 0;
	for (const full of await filesToSearch(root, options.path, options.includeHidden)) {
		if (matches >= MAX_GREP_MATCHES) break;
		const info = await stat(full).catch(() => null);
		if (!info || info.size > MAX_GREP_FILE_BYTES) continue;
		const bytes = await readFile(full).catch(() => null);
		if (!bytes || isBinary(bytes)) continue;
		const lines = bytes.toString("utf-8").split(/\r?\n/);
		const rel = displayPath(root, full);
		const hits: number[] = [];
		for (let i = 0; i < lines.length && matches + hits.length < MAX_GREP_MATCHES; i++) {
			if (!regex.test(lines[i] ?? "")) continue;
			hits.push(i);
			if (options.maxCount && hits.length >= options.maxCount) break;
		}
		if (hits.length === 0) continue;
		files++;
		matches += hits.length;
		const hit = new Set(hits);
		let shownUpTo = -1;
		for (const i of hits) {
			const from = Math.max(i - options.contextLines, shownUpTo + 1);
			const to = Math.min(i + options.contextLines, lines.length - 1);
			if (options.contextLines > 0 && shownUpTo >= 0 && from > shownUpTo + 1) out.push("--");
			for (let j = from; j <= to; j++) {
				const mark = hit.has(j) ? ":" : "-";
				out.push(`${rel}${mark}${j + 1}${mark}${(lines[j] ?? "").slice(0, MAX_LINE_CHARS)}`);
			}
			shownUpTo = Math.max(shownUpTo, to);
		}
	}
	if (matches === 0) return "No matches found.";
	const more = matches >= MAX_GREP_MATCHES ? " (stopped there; narrow the search)" : "";
	return `${out.join("\n")}\n\n${matches} matches in ${files} files${more}`;
}
