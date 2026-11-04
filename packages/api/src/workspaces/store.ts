// Workspaces: each character has one, /workspace of its computer (agent/tools/computer.ts), kept
// in a Docker volume. The agent's commands work in it, and the user sees its files
// in the conversation's 「ファイル」 tab; nothing of it is on this PC.

import type { WorkspaceFile } from "@nextroom/contracts";

import { asUser, fileRequest, readFileStream } from "../agent/tools/computer";
import { track } from "../lib/children";
import { hasDoc } from "../lib/db";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { loadAgentSettings } from "../settings/agent";

/** The computer's settings, when the character exists and its computer is in use. */
function computerOf(characterId: string) {
	if (!hasDoc("characters", characterId))
		throw new NotFoundError(`キャラクターが見つかりません: ${characterId}`);
	const settings = loadAgentSettings();
	if (!settings.computer.enabled)
		throw new BadRequestError("コンピューターは設定でオフになっています");
	return settings.computer;
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
	if (!loadAgentSettings().computer.enabled) return;
	const slash = path.lastIndexOf("/");
	await fileRequest(
		characterId,
		computerOf(characterId),
		{ op: "save", dir: path.slice(0, Math.max(slash, 0)), path: path.slice(slash + 1) },
		new Blob([new Uint8Array(bytes)]),
	);
}

/** A file's bytes. */
export const workspaceFileBytes = async (characterId: string, path: string) =>
	new Uint8Array(await new Response(await workspaceFileStream(characterId, path)).arrayBuffer());

/** An audio file of the workspace as a mono 16-bit WAV, made by the computer's ffmpeg. */
export async function workspaceAudioWav(characterId: string, path: string): Promise<Uint8Array> {
	const settings = computerOf(characterId);
	const full = await fileRequest<string>(characterId, settings, { op: "file", path });
	const script =
		'f=$(mktemp --suffix=.wav) && ffmpeg -nostdin -loglevel error -y -i "$1" -ac 1 -c:a pcm_s16le "$f" && cat "$f"; s=$?; rm -f "$f"; exit $s';
	const proc = track(
		Bun.spawn(["docker", ...asUser(characterId), "sh", "-c", script, "sh", full], {
			stdout: "pipe",
			stderr: "pipe",
			windowsHide: true,
		}),
	);
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).arrayBuffer(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (code !== 0)
		throw new BadRequestError(
			`音声を読み込めません: ${path} (${err.trim().split("\n").at(-1) ?? code})`,
		);
	return new Uint8Array(out);
}
