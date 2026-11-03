// Workspaces: each character has one, /workspace of its computer (agent/tools/computer.ts), kept
// in a Docker volume. The agent's file and command tools work in it, and the user sees its files
// in the conversation's 「ファイル」 tab; nothing of it is on this PC.

import type { WorkspaceFile } from "@nextroom/contracts";

import { fileRequest, readFileStream } from "../agent/tools/computer";
import { hasDoc } from "../lib/db";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { loadAgentSettings } from "../settings/agent";

/** The computer's settings, when the character exists and its computer is in use. */
function computerOf(characterId: string) {
	if (!hasDoc("characters", characterId))
		throw new NotFoundError(`キャラクターが見つかりません: ${characterId}`);
	const settings = loadAgentSettings();
	if (!settings.sandbox.enabled && !settings.desktop.enabled)
		throw new BadRequestError("コンピューターの道具がオフになっています");
	return settings.container;
}

const request = <T = null>(characterId: string, body: { op: string } & Record<string, unknown>) =>
	fileRequest<T>(characterId, computerOf(characterId), body);

/** Saves uploaded files under `dir`, keeping their relative paths; same names are overwritten. */
export async function saveWorkspaceFiles(
	characterId: string,
	dir: string,
	files: { file: File; path: string }[],
): Promise<void> {
	const settings = computerOf(characterId);
	for (const { file, path } of files)
		await fileRequest(characterId, settings, { op: "save", dir, path }, file);
}

export const createWorkspaceFolder = (characterId: string, path: string) =>
	request(characterId, { op: "make_folder", path });

/** Renames or moves a file or folder; never over an existing one. */
export const moveWorkspaceEntry = (characterId: string, from: string, to: string) =>
	request(characterId, { op: "move", from, to });

export const deleteWorkspaceEntry = (characterId: string, path: string) =>
	request(characterId, { op: "remove", path });

/** Every file in the workspace (up to 500), by path. */
export const listWorkspaceFiles = (characterId: string) =>
	request<WorkspaceFile[]>(characterId, { op: "tree" });

/** A file's bytes, streamed out of the computer. */
export const workspaceFileStream = (characterId: string, path: string) =>
	readFileStream(characterId, computerOf(characterId), path);

/** Copies `bytes` to `path` of the workspace, when the character has a computer to keep it in. */
export async function copyToWorkspace(characterId: string, path: string, bytes: Uint8Array) {
	if (!loadAgentSettings().sandbox.enabled) return;
	const slash = path.lastIndexOf("/");
	await fileRequest(
		characterId,
		computerOf(characterId),
		{ op: "save", dir: path.slice(0, Math.max(slash, 0)), path: path.slice(slash + 1) },
		new Blob([new Uint8Array(bytes)]),
	);
}
