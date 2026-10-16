// Workspaces: each character has one, `workspace/` of its folder, made the first time it is
// used. The agent's file and command tools (a Mastra workspace) and Claude Agent SDK work in it,
// and the user sees its files in the conversation's 「ファイル」 tab.

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import type { WorkspaceFile } from "@nextroom/contracts";

import { characterDir, characterFile } from "../characters/paths";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";

/** The character's workspace, made when missing; the character must exist. */
export function workspaceDir(characterId: string): string {
	const dir = characterDir(characterId);
	if (!existsSync(characterFile(dir)))
		throw new NotFoundError(`キャラクターが見つかりません: ${characterId}`);
	const path = join(dir, "workspace");
	mkdirSync(path, { recursive: true });
	return path;
}

/** A file inside the workspace; never outside it. */
export function workspaceFile(characterId: string, path: string): string {
	const root = workspaceDir(characterId);
	const full = resolve(root, path);
	if (full !== root && !full.startsWith(root + sep))
		throw new NotFoundError("ファイルがありません");
	return full;
}

/** A file or folder inside the workspace, never the workspace itself. */
function workspaceEntry(characterId: string, path: string): string {
	const full = workspaceFile(characterId, path);
	if (full === workspaceDir(characterId)) throw new BadRequestError("パスを指定してください");
	return full;
}

/** Saves uploaded files under `dir`, keeping their relative paths; same names are overwritten. */
export async function saveWorkspaceFiles(
	characterId: string,
	dir: string,
	files: { file: File; path: string }[],
): Promise<void> {
	const base = workspaceFile(characterId, dir);
	const targets = files.map((f) => {
		const full = resolve(base, f.path);
		if (!full.startsWith(base + sep)) throw new BadRequestError(`不正なパスです: ${f.path}`);
		if (statSync(full, { throwIfNoEntry: false })?.isDirectory())
			throw new ConflictError(`同じ名前のフォルダがあります: ${f.path}`);
		return { file: f.file, full };
	});
	for (const { file, full } of targets) {
		mkdirSync(dirname(full), { recursive: true });
		await Bun.write(full, file);
	}
}

export function createWorkspaceFolder(characterId: string, path: string): void {
	const full = workspaceEntry(characterId, path);
	if (existsSync(full)) throw new ConflictError(`同じ名前があります: ${path}`);
	mkdirSync(full, { recursive: true });
}

/** Renames or moves a file or folder; never over an existing one. */
export function moveWorkspaceEntry(characterId: string, from: string, to: string): void {
	const source = workspaceEntry(characterId, from);
	const target = workspaceEntry(characterId, to);
	if (source === target) return;
	if (!existsSync(source)) throw new NotFoundError(`ありません: ${from}`);
	if (target.startsWith(source + sep))
		throw new BadRequestError("フォルダをその中には移動できません");
	// A case-only rename on Windows sees the target as existing.
	if (existsSync(target) && source.toLowerCase() !== target.toLowerCase())
		throw new ConflictError(`同じ名前があります: ${to}`);
	mkdirSync(dirname(target), { recursive: true });
	renameSync(source, target);
}

export function deleteWorkspaceEntry(characterId: string, path: string): void {
	const full = workspaceEntry(characterId, path);
	if (!existsSync(full)) throw new NotFoundError(`ありません: ${path}`);
	rmSync(full, { recursive: true, force: true });
}

const MAX_FILES = 500;
const SKIPPED = new Set(["node_modules", ".git", "__pycache__", ".venv"]);

/** Every file in the workspace (up to 500), by path. */
export function listWorkspaceFiles(characterId: string): WorkspaceFile[] {
	const root = workspaceDir(characterId);
	const out: WorkspaceFile[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (out.length >= MAX_FILES) return;
			const full = join(dir, entry.name);
			const stat = statSync(full, { throwIfNoEntry: false });
			if (!stat) continue;
			out.push({
				path: relative(root, full).split(sep).join("/"),
				size: stat.isDirectory() ? 0 : stat.size,
				dir: stat.isDirectory(),
				modified_at: stat.mtimeMs / 1000,
			});
			if (stat.isDirectory() && !SKIPPED.has(entry.name)) walk(full);
		}
	};
	walk(root);
	return out.sort((a, b) => a.path.localeCompare(b.path));
}
