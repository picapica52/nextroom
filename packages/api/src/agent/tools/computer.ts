// A character's computer: one Docker container per character, made from packages/api/desktop,
// with its workspace (/workspace) and home (/home/user) in volumes of its own. Everything the
// character does on a computer happens in it: the desktop (desktop.ts), its files and commands
// (sandbox.ts), and the user's 「ファイル」 tab (workspaces/store.ts). Nothing of this PC is
// mounted in it.
//
// A computer no one has used or watched for a while is stopped; the next use starts it again.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { characterDir } from "../../characters/paths";
import { track } from "../../lib/children";
import { BadRequestError, ConflictError, messageOf, NotFoundError } from "../../lib/errors";
import type { AgentSettings } from "../../settings/agent";
import { docker, dockerError, dockerNetwork } from "./docker";

type ContainerSettings = AgentSettings["container"];

/** Where the workspace is in the computer. */
export const WORKSPACE = "/workspace";

const IMAGE_DIR = join(import.meta.dir, "../../../desktop");
const IMAGE_FILES = ["Dockerfile", "start.sh", "control.py", "files.py", "view.html"];
export const VNC_PORT = 6080;
const BUILD_TIMEOUT_MS = 30 * 60_000;
const START_TIMEOUT_MS = 60_000;
const IDLE_MS = 15 * 60_000;
const FILES_TIMEOUT_MS = 60_000;

export const containerName = (characterId: string) => `nextroom-desktop-${characterId}`;
const homeVolume = (characterId: string) => `nextroom-desktop-home-${characterId}`;
const workspaceVolume = (characterId: string) => `nextroom-workspace-${characterId}`;
/** The container files and commands had before they moved into the computer. */
const oldSandbox = (characterId: string) => `nextroom-${characterId}`;

/** `docker exec` as the character's user, in the workspace, seeing the screen. */
export const asUser = (characterId: string, cwd = WORKSPACE) => [
	"exec",
	"-u",
	"user",
	"-e",
	"HOME=/home/user",
	"-e",
	"DISPLAY=:1",
	"-w",
	cwd,
	containerName(characterId),
];

/** The image, tagged by its files so that a changed Dockerfile is built again. */
function imageTag(): string {
	const hash = createHash("sha256");
	for (const file of IMAGE_FILES) hash.update(readFileSync(join(IMAGE_DIR, file)));
	return `nextroom-desktop:${hash.digest("hex").slice(0, 12)}`;
}

let building: Promise<string> | null = null;

function ensureImage(): Promise<string> {
	building ??= (async () => {
		const tag = imageTag();
		if ((await docker(["image", "inspect", tag])).code === 0) return tag;
		const built = await docker(["build", "-t", tag, IMAGE_DIR], BUILD_TIMEOUT_MS);
		if (built.code !== 0)
			throw new Error(`Could not build the computer's image: ${dockerError(built)}`);
		// Images of earlier versions; one still used by a container stays until it is made again.
		const images = await docker([
			"images",
			"nextroom-desktop",
			"--format",
			"{{.Repository}}:{{.Tag}}",
		]);
		const old = images.out.split("\n").filter((image) => image && image !== tag);
		if (old.length) await docker(["rmi", ...old], 60_000);
		return tag;
	})().finally(() => {
		building = null;
	});
	return building;
}

/** What the container is made with; a container made otherwise is made again. */
function settingsHash(s: ContainerSettings, image: string, mounts: string[]): string {
	return Bun.hash(JSON.stringify([image, s.memory_mb, s.cpus, mounts, dockerNetwork()])).toString(
		36,
	);
}

export interface Computer {
	/** host:port of its websockify. */
	address: string;
	lastUsed: number;
}

/** The computers started since the app started, by character. */
const computers = new Map<string, Computer>();
const preparing = new Map<string, Promise<Computer>>();
const failures = new Map<string, string>();
/** Open screens per character; a computer someone is watching is not stopped. */
const viewers = new Map<string, number>();
/** Commands running per character; a computer running one is not stopped. */
const busy = new Map<string, number>();
const goneListeners: ((characterId: string) => void)[] = [];

/** Called whenever the character's computer stops or is made again. */
export function onComputerGone(listener: (characterId: string) => void): void {
	goneListeners.push(listener);
}

function gone(characterId: string): void {
	computers.delete(characterId);
	for (const listener of goneListeners) listener(characterId);
}

/** The character's running computer, made or started when needed. */
export function ensureComputer(characterId: string, s: ContainerSettings): Promise<Computer> {
	const running = preparing.get(characterId);
	if (running) return running;
	const job = prepareComputer(characterId, s)
		.then((computer) => {
			failures.delete(characterId);
			computers.set(characterId, computer);
			startSweeping();
			return computer;
		})
		.catch((error) => {
			failures.set(characterId, messageOf(error));
			throw error;
		})
		.finally(() => preparing.delete(characterId));
	preparing.set(characterId, job);
	return job;
}

/** The running computer, started when need be, marked as used now. */
export async function useComputer(characterId: string, s: ContainerSettings): Promise<Computer> {
	const computer = computers.get(characterId) ?? (await ensureComputer(characterId, s));
	computer.lastUsed = Date.now();
	return computer;
}

async function prepareComputer(characterId: string, s: ContainerSettings): Promise<Computer> {
	if (!Bun.which("docker")) throw new Error("Docker が見つかりません");
	const name = containerName(characterId);
	const image = await ensureImage();
	const mounts = [
		"-v",
		`${workspaceVolume(characterId)}:${WORKSPACE}`,
		"-v",
		`${homeVolume(characterId)}:/home/user`,
	];
	const hash = settingsHash(s, image, mounts);
	const info = await docker([
		"inspect",
		"--format",
		'{{index .Config.Labels "nextroom.settings"}} {{.State.Running}}',
		name,
	]);
	let ready = false;
	if (info.code === 0) {
		const [label, isRunning] = info.out.split(" ");
		if (label !== hash || isRunning !== "true") gone(characterId);
		if (label === hash) {
			// A running one whose screen is down is made again rather than trusted.
			ready =
				isRunning === "true"
					? await screenUp(name)
					: (await docker(["start", name], START_TIMEOUT_MS)).code === 0;
		}
		if (!ready) {
			gone(characterId);
			await docker(["rm", "-f", name], 60_000);
		}
	}
	if (!ready) {
		await docker(["rm", "-f", oldSandbox(characterId)], 60_000);
		const network = dockerNetwork();
		const created = await docker(
			[
				"run",
				"-d",
				"--name",
				name,
				"--label",
				`nextroom.desktop=${characterId}`,
				"--label",
				`nextroom.settings=${hash}`,
				"--memory",
				`${s.memory_mb}m`,
				"--cpus",
				String(s.cpus),
				"--shm-size",
				"512m",
				"--init",
				...(network ? ["--network", network] : ["-p", `127.0.0.1::${VNC_PORT}`]),
				...mounts,
				image,
			],
			START_TIMEOUT_MS,
		);
		if (created.code !== 0)
			throw new Error(`Could not start the computer's container: ${dockerError(created)}`);
	}
	const address = await addressOf(name);
	await waitUntilUp(name, address);
	await moveOldWorkspace(characterId);
	return { address, lastUsed: Date.now() };
}

/** Moves a workspace kept on this PC (before workspaces were in the computer) into the computer;
 *  the folder is left renamed to workspace.moved. */
async function moveOldWorkspace(characterId: string): Promise<void> {
	const dir = join(characterDir(characterId), "workspace");
	if (!existsSync(dir)) return;
	const name = containerName(characterId);
	if (readdirSync(dir).length) {
		const copied = await docker(["cp", `${dir}/.`, `${name}:${WORKSPACE}`], 10 * 60_000);
		if (copied.code !== 0)
			throw new Error(`Could not move the workspace into the computer: ${dockerError(copied)}`);
		await docker(["exec", name, "chown", "-R", "user:user", WORKSPACE], 5 * 60_000);
	}
	renameSync(dir, `${dir}.moved`);
}

/** Where the app reaches the container's websockify. */
async function addressOf(name: string): Promise<string> {
	if (dockerNetwork()) return `${name}:${VNC_PORT}`;
	const port = await docker(["port", name, `${VNC_PORT}/tcp`]);
	const published = port.out.split("\n").find((line) => line.includes(":"));
	if (port.code !== 0 || !published) throw new Error("The desktop's screen port is not published.");
	return `127.0.0.1:${published.split(":").at(-1)}`;
}

/** Whether the display and both VNC servers (watching and taking over) answer. */
async function screenUp(name: string): Promise<boolean> {
	const check = await docker([
		"exec",
		"-u",
		"user",
		name,
		"bash",
		"-c",
		"xdpyinfo -display :1 >/dev/null && exec 3<>/dev/tcp/127.0.0.1/5900 4<>/dev/tcp/127.0.0.1/5901",
	]);
	return check.code === 0;
}

async function waitUntilUp(name: string, address: string): Promise<void> {
	const until = Date.now() + START_TIMEOUT_MS;
	while (Date.now() < until) {
		const web = await fetch(`http://${address}/nextroom.html`).then(
			(r) => r.ok,
			() => false,
		);
		if (web && (await screenUp(name))) return;
		await Bun.sleep(500);
	}
	// Left running, it would look started with nothing on its screen.
	await docker(["stop", name], 60_000);
	throw new Error("The computer's screen did not come up in time.");
}

let sweeper: ReturnType<typeof setInterval> | null = null;

/** Stops the computers no one has used, watched or run a command on for IDLE_MS. */
function startSweeping(): void {
	sweeper ??= setInterval(() => {
		const now = Date.now();
		for (const [characterId, computer] of computers) {
			if ((viewers.get(characterId) ?? 0) > 0 || (busy.get(characterId) ?? 0) > 0) continue;
			if (now - computer.lastUsed < IDLE_MS) continue;
			gone(characterId);
			void docker(["stop", containerName(characterId)], 60_000);
		}
	}, 60_000);
	sweeper.unref?.();
}

/** Keeps the computer from being stopped while a command runs; call the answer when it ends. */
export function holdComputer(characterId: string): () => void {
	busy.set(characterId, (busy.get(characterId) ?? 0) + 1);
	return () => {
		busy.set(characterId, Math.max(0, (busy.get(characterId) ?? 1) - 1));
		const computer = computers.get(characterId);
		if (computer) computer.lastUsed = Date.now();
	};
}

/** Counts a screen opened (+1) or closed (-1) on the computer. */
export function watchComputer(characterId: string, change: 1 | -1): void {
	viewers.set(characterId, Math.max(0, (viewers.get(characterId) ?? 0) + change));
	const computer = computers.get(characterId);
	if (computer) computer.lastUsed = Date.now();
}

/** The computer, if it was started (or found running) since the app started. */
export const runningComputer = (characterId: string) => computers.get(characterId);

/** Forgets the computer, so that its next use checks on it again. */
export const forgetComputer = (characterId: string) => {
	computers.delete(characterId);
};

/** Stops the character's computer (its workspace and home stay). */
export async function stopComputer(characterId: string): Promise<void> {
	await preparing.get(characterId)?.catch(() => {});
	gone(characterId);
	await docker(["stop", containerName(characterId)], 60_000);
}

/** Removes the character's computer with its workspace and home, when the character goes. */
export async function removeComputer(characterId: string): Promise<void> {
	if (!Bun.which("docker")) return;
	await preparing.get(characterId)?.catch(() => {});
	gone(characterId);
	failures.delete(characterId);
	await docker(["rm", "-f", containerName(characterId), oldSandbox(characterId)], 60_000);
	await docker(
		["volume", "rm", "-f", homeVolume(characterId), workspaceVolume(characterId)],
		60_000,
	);
}

export interface ComputerState {
	running: boolean;
	starting: boolean;
	error: string | null;
}

/** Whether the computer is up, taking one left running from before the app restarted. */
export async function computerState(characterId: string): Promise<ComputerState> {
	const starting = preparing.has(characterId);
	if (!Bun.which("docker")) return { running: false, starting, error: "Docker が見つかりません" };
	const name = containerName(characterId);
	const state = await docker(["inspect", "--format", "{{.State.Running}}", name]);
	const up = !starting && state.code === 0 && state.out === "true" && (await screenUp(name));
	if (!up && !starting) gone(characterId);
	if (up && !computers.has(characterId)) {
		const address = await addressOf(name).catch(() => null);
		if (address) {
			computers.set(characterId, { address, lastUsed: Date.now() });
			startSweeping();
		}
	}
	return {
		running: up && computers.has(characterId),
		starting,
		error: failures.get(characterId) ?? null,
	};
}

// Files: files.py in the computer, one request each

type FileRequest = { op: string } & Record<string, unknown>;

interface FileAnswer {
	result?: unknown;
	error?: string;
	kind?: "not_found" | "conflict" | "bad_request" | "error";
}

const ERRORS = {
	not_found: NotFoundError,
	conflict: ConflictError,
	bad_request: BadRequestError,
	error: Error,
};

/** Runs a request of files.py in the computer, as the character's user; `bytes` follow it on
 *  stdin (an upload). Throws its error as the API's error of that kind. */
export async function fileRequest<T>(
	characterId: string,
	s: ContainerSettings,
	request: FileRequest,
	bytes?: Blob,
): Promise<T> {
	await useComputer(characterId, s);
	const proc = track(
		Bun.spawn(
			["docker", "exec", "-i", "-u", "user", containerName(characterId), "nextroom-files"],
			{ stdin: "pipe", stdout: "pipe", stderr: "pipe", windowsHide: true },
		),
	);
	const timer = setTimeout(() => proc.kill(), FILES_TIMEOUT_MS);
	try {
		proc.stdin.write(`${JSON.stringify(request)}\n`);
		if (bytes) proc.stdin.write(new Uint8Array(await bytes.arrayBuffer()));
		await proc.stdin.end();
		const [out, err, code] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		let answer: FileAnswer;
		try {
			answer = JSON.parse(out) as FileAnswer;
		} catch {
			throw new Error(
				`The computer did not answer: ${err.trim().split("\n").at(-1) || `exit ${code}`}`,
			);
		}
		if (answer.error !== undefined) throw new ERRORS[answer.kind ?? "error"](answer.error);
		return answer.result as T;
	} finally {
		clearTimeout(timer);
	}
}

/** A file in the computer's workspace, streamed out of it (a download). */
export async function readFileStream(
	characterId: string,
	s: ContainerSettings,
	path: string,
): Promise<ReadableStream<Uint8Array>> {
	const full = await fileRequest<string>(characterId, s, { op: "file", path });
	const proc = track(
		Bun.spawn(["docker", ...asUser(characterId), "cat", "--", full], {
			stdout: "pipe",
			stderr: "ignore",
			windowsHide: true,
		}),
	);
	return proc.stdout;
}
