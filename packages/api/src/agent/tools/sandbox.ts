// The agent's file and command tools (workspace_*): its files are the character's workspace
// (workspaces/store.ts), and its commands run in a Docker container with that folder mounted at
// /workspace (one container per character). The user sees its files in the files tab and can
// download them or add some.
//
// On Windows the "local" provider runs commands on this PC with no isolation at all; Docker
// (Docker Desktop) is the one that keeps them in a box.

import { lstat, mkdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, relative, sep } from "node:path";
import type { DockerStatus } from "@nextroom/contracts";
import type { Subprocess } from "bun";
import { z } from "zod";
import { track } from "../../lib/children";
import { messageOf } from "../../lib/errors";
import type { AgentSettings } from "../../settings/agent";
import { workspaceDir } from "../../workspaces/store";
import { DECLINED } from "../prompts";
import { type CharacterTool, defineTool, type ToolCall, type ToolSet } from "../tool";
import {
	displayPath,
	grepWorkspace,
	listWorkspace,
	MOUNT,
	readWorkspaceFile,
	resolveInside,
} from "./workspace-files";

type SandboxSettings = AgentSettings["sandbox"];

const DEFAULT_TAIL_LINES = 200;
const MAX_RESULT_CHARS = 20_000;
const KEEP_OUTPUT_CHARS = 200_000;
const CREATE_TIMEOUT_MS = 10 * 60_000;

/** Ask the user first when `needed`; false once they refuse. */
async function allowed(needed: boolean, name: string, input: unknown, call: ToolCall) {
	return !needed || (await call.context.reporter.approve(call.id, name, input));
}

/** A tool that asks the user first when `needs(settings)` says so. */
function gated<S extends z.ZodType>(
	settings: AgentSettings,
	needs: ((s: SandboxSettings) => boolean) | null,
	tool: {
		name: string;
		description: string;
		schema: S;
		execute: (input: z.infer<S>, call: ToolCall, root: string) => Promise<unknown>;
	},
): CharacterTool {
	return defineTool({
		...tool,
		execute: async (input, call) => {
			if (!(await allowed(needs?.(settings.sandbox) ?? false, tool.name, input, call)))
				return DECLINED.sandbox;
			return tool.execute(input, call, workspaceDir(call.context.characterId));
		},
	});
}

// Containers

const containerName = (characterId: string) => `nextroom-${characterId}`;

/** A docker command's output, killed after `timeoutMs`. */
async function docker(
	args: string[],
	timeoutMs = 10_000,
): Promise<{ code: number; out: string; err: string }> {
	const proc = track(
		Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe", windowsHide: true }),
	);
	const timer = setTimeout(() => proc.kill(), timeoutMs);
	try {
		const [out, err, code] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		return { code, out: out.trim(), err: err.trim() };
	} finally {
		clearTimeout(timer);
	}
}

/** What the container is made with; a container made otherwise is made again. */
function settingsHash(s: SandboxSettings, dir: string): string {
	const made = [s.image, s.memory_mb, s.cpus, s.network, dir];
	return Bun.hash(JSON.stringify(made)).toString(36);
}

const preparing = new Map<string, Promise<string>>();

/** The character's running container, made or started when needed. */
function ensureContainer(characterId: string, s: SandboxSettings): Promise<string> {
	const running = preparing.get(characterId);
	if (running) return running;
	const job = prepareContainer(characterId, s).finally(() => preparing.delete(characterId));
	preparing.set(characterId, job);
	return job;
}

async function prepareContainer(characterId: string, s: SandboxSettings): Promise<string> {
	const name = containerName(characterId);
	const dir = workspaceDir(characterId);
	const hash = settingsHash(s, dir);
	const info = await docker([
		"inspect",
		"--format",
		'{{index .Config.Labels "nextroom.settings"}} {{.State.Running}}',
		name,
	]);
	if (info.code === 0) {
		const [label, isRunning] = info.out.split(" ");
		if (label === hash) {
			if (isRunning === "true") return name;
			const started = await docker(["start", name], 60_000);
			if (started.code === 0) return name;
		}
		await docker(["rm", "-f", name], 60_000);
	}
	const created = await docker(
		[
			"run",
			"-d",
			"--name",
			name,
			"--label",
			`nextroom.workspace=${characterId}`,
			"--label",
			`nextroom.settings=${hash}`,
			"--memory",
			`${s.memory_mb}m`,
			"--cpus",
			String(s.cpus),
			...(s.network ? [] : ["--network", "none"]),
			"--init",
			"-v",
			`${dir}:${MOUNT}`,
			"-w",
			MOUNT,
			s.image,
			"sleep",
			"infinity",
		],
		CREATE_TIMEOUT_MS,
	);
	if (created.code !== 0) {
		const reason = created.err.split("\n").at(-1) || `exit ${created.code}`;
		throw new Error(`Could not start the Docker container: ${reason}`);
	}
	return name;
}

// Commands

/** Runs the command in its own process group and records the group, so that a timeout can
 *  kill everything it started. $1 = pid file, $2 = command. */
const SPAWN_WRAPPER = `
mkdir -p /tmp/.nextroom 2>/dev/null
if setsid -w true >/dev/null 2>&1; then
  exec setsid -w sh -c 'echo $$ > "$1"; sh -lc "$2"; ret=$?; rm -f "$1"; exit $ret' sh "$1" "$2"
fi
echo $$ > "$1"
sh -lc "$2"
ret=$?
rm -f "$1"
exit $ret
`;

const KILL_SCRIPT = `
pid=$(cat "$1" 2>/dev/null)
[ -n "$pid" ] || exit 0
kill -KILL -"$pid" 2>/dev/null
kill -KILL "$pid" 2>/dev/null
rm -f "$1"
`;

/** Commands running now, by character, so that resetting the sandbox stops them. */
const runningCommands = new Map<string, Set<() => void>>();

interface Running {
	proc: Subprocess<"ignore", "pipe", "pipe">;
	kill: () => void;
}

function spawnInContainer(container: string, command: string, cwd: string): Running {
	const pidFile = `/tmp/.nextroom/${crypto.randomUUID()}`;
	const proc = track(
		Bun.spawn(
			["docker", "exec", "-w", cwd, container, "sh", "-c", SPAWN_WRAPPER, "sh", pidFile, command],
			{ stdin: "ignore", stdout: "pipe", stderr: "pipe", windowsHide: true },
		),
	);
	const kill = () => {
		void docker(["exec", container, "sh", "-c", KILL_SCRIPT, "sh", pidFile]).finally(() =>
			setTimeout(() => proc.kill(), 2000),
		);
	};
	return { proc, kill };
}

function spawnLocal(command: string, cwd: string): Running {
	const windows = process.platform === "win32";
	const proc = track(
		Bun.spawn(windows ? ["cmd.exe", "/d", "/s", "/c", `"${command}"`] : ["sh", "-c", command], {
			cwd,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
			windowsHide: true,
			windowsVerbatimArguments: true,
			detached: !windows,
		}),
	);
	const kill = () => {
		if (windows) {
			Bun.spawn(["taskkill", "/pid", String(proc.pid), "/t", "/f"], { windowsHide: true });
			return;
		}
		try {
			process.kill(-proc.pid, "SIGKILL");
		} catch {
			proc.kill("SIGKILL");
		}
	};
	return { proc, kill };
}

/** The last `lines` lines of `text`, at most MAX_RESULT_CHARS. */
function tailOf(text: string, lines: number): string {
	let out = text.replace(/\s+$/, "");
	if (lines > 0) {
		const all = out.split("\n");
		if (all.length > lines)
			out = `[... ${all.length - lines} lines above]\n${all.slice(-lines).join("\n")}`;
	}
	return out.length > MAX_RESULT_CHARS ? `[...]${out.slice(-MAX_RESULT_CHARS)}` : out;
}

/** Runs the command, streaming its output to the screen, and answers with its exit code and
 *  the tail of its output. */
async function runCommand(
	running: Running,
	call: ToolCall,
	timeoutSec: number,
	tailLines: number,
): Promise<string> {
	const characterId = call.context.characterId;
	const kills = runningCommands.get(characterId) ?? new Set();
	runningCommands.set(characterId, kills);
	let stopped: "timeout" | "cancelled" | null = null;
	const stop = (why: "timeout" | "cancelled") => {
		if (stopped) return;
		stopped = why;
		running.kill();
	};
	const cancel = () => stop("cancelled");
	const timer = setTimeout(() => stop("timeout"), timeoutSec * 1000);
	call.signal.addEventListener("abort", cancel, { once: true });
	kills.add(cancel);
	if (call.signal.aborted) cancel();

	let output = "";
	const pump = async (stream: ReadableStream<Uint8Array>) => {
		const decoder = new TextDecoder();
		for await (const chunk of stream) {
			const text = decoder.decode(chunk, { stream: true });
			if (!text) continue;
			output = (output + text).slice(-KEEP_OUTPUT_CHARS);
			call.output(text);
		}
	};
	try {
		const [code] = await Promise.all([
			running.proc.exited,
			pump(running.proc.stdout),
			pump(running.proc.stderr),
		]);
		if (stopped === "timeout") call.output(`\n[${timeoutSec} 秒で打ち切りました]`);
		else if (code !== 0) call.output(`\n[終了コード ${code}]`);
		const head =
			stopped === "timeout"
				? `Timed out after ${timeoutSec} s; the command was killed.`
				: stopped === "cancelled"
					? "Cancelled; the command was killed."
					: `Exit code: ${code}`;
		const tail = tailOf(output, tailLines);
		return tail ? `${head}\n${tail}` : `${head}\n(no output)`;
	} finally {
		clearTimeout(timer);
		call.signal.removeEventListener("abort", cancel);
		kills.delete(cancel);
	}
}

/** The container's path for a host path inside the workspace. */
const inContainer = (root: string, full: string) => {
	const rel = relative(root, full).split(sep).join("/");
	return rel ? `${MOUNT}/${rel}` : MOUNT;
};

// Tools

export function sandboxTools(settings: AgentSettings): ToolSet {
	if (!settings.sandbox.enabled) return {};
	const tools = [
		gated(settings, null, {
			name: "workspace_read_file",
			description:
				"Read a file from the workspace. Text files come back as text with line numbers — use offset/limit to read a line range from large files. Binary files return only their metadata (path, size, type) unless you ask for an encoding.",
			schema: z.object({
				path: z.string().describe('The path to the file to read (e.g., "data/config.json")'),
				offset: z
					.number()
					.int()
					.min(1)
					.optional()
					.describe("Line number to start reading from (1-indexed). Defaults to line 1."),
				limit: z
					.number()
					.int()
					.min(1)
					.optional()
					.describe("Maximum number of lines to read. Defaults to the end of the file."),
				showLineNumbers: z
					.boolean()
					.optional()
					.default(true)
					.describe('Prefix each line with its line number (e.g., "     1→"). Defaults to true.'),
				encoding: z
					.enum(["utf-8", "base64", "hex"])
					.optional()
					.describe(
						"Usually omit this. Pass `base64` or `hex` to get a binary file's raw bytes encoded as text.",
					),
			}),
			execute: async ({ path, ...options }, _call, root) =>
				readWorkspaceFile(root, await resolveInside(root, path), options),
		}),
		gated(settings, (s) => s.approve_write, {
			name: "workspace_write_file",
			description:
				"Write content to a file in the workspace. Creates parent directories if needed.",
			schema: z.object({
				path: z.string().describe('The path where to write the file (e.g., "data/output.txt")'),
				content: z.string().describe("The content to write to the file"),
				overwrite: z
					.boolean()
					.optional()
					.default(true)
					.describe("Whether to overwrite the file if it already exists"),
			}),
			execute: async ({ path, content, overwrite }, _call, root) => {
				const full = await resolveInside(root, path);
				if (full === root) throw new Error("Give the path of a file.");
				await mkdir(dirname(full), { recursive: true });
				await writeFile(full, content, { flag: overwrite ? "w" : "wx" }).catch((error) => {
					if ((error as NodeJS.ErrnoException).code === "EEXIST")
						throw new Error(`${path} already exists; pass overwrite: true to replace it.`);
					throw error;
				});
				return `Wrote ${Buffer.byteLength(content)} bytes to ${displayPath(root, full)}`;
			},
		}),
		gated(settings, (s) => s.approve_write, {
			name: "workspace_edit_file",
			description: `Edit a file by replacing specific text. The old_string must match exactly and be unique in the file.

Usage:
- Read the file first to get the exact text to replace.
- Read file output includes line number prefixes (e.g., "     1→"). Keep the exact indentation as it appears AFTER the arrow. Never include any part of the line number prefix in old_string or new_string.
- Include enough surrounding context (multiple lines) to make old_string unique. If it still isn't unique, include more lines.
- Use replace_all only when intentionally replacing all occurrences.`,
			schema: z.object({
				path: z.string().describe("The path to the file to edit"),
				old_string: z
					.string()
					.min(1)
					.describe("The exact text to find and replace. Must be unique in the file."),
				new_string: z.string().describe("The text to replace old_string with"),
				replace_all: z
					.boolean()
					.optional()
					.default(false)
					.describe(
						"If true, replace all occurrences. If false (default), old_string must be unique.",
					),
			}),
			execute: async ({ path, old_string, new_string, replace_all }, _call, root) => {
				const full = await resolveInside(root, path);
				const text = await readFile(full, "utf-8");
				const parts = text.split(old_string);
				const count = parts.length - 1;
				if (count === 0) throw new Error(`old_string was not found in ${path}.`);
				if (count > 1 && !replace_all)
					throw new Error(
						`old_string was found ${count} times in ${path}; include more context to make it unique, or pass replace_all: true.`,
					);
				await writeFile(full, parts.join(new_string));
				return `Replaced ${count} occurrence${count > 1 ? "s" : ""} in ${displayPath(root, full)}`;
			},
		}),
		gated(settings, null, {
			name: "workspace_list_files",
			description: `List files and directories in the workspace.
Returns a compact tab-indented listing; directories end with "/".
Options mirror common tree command flags.

Examples:
- List workspace root: { path: "." }
- Deep listing: { path: "src", maxDepth: 5 }
- Directories only: { path: ".", dirsOnly: true }
- Exclude node_modules: { path: ".", exclude: "node_modules" }
- Find TypeScript files: { path: "src", pattern: "**/*.ts" }
- Multiple patterns: { path: ".", pattern: ["**/*.ts", "**/*.tsx"] }

To list ALL files, omit the pattern parameter — do NOT pass pattern: "*".`,
			schema: z.object({
				path: z.string().optional().default(".").describe("Directory path to list"),
				maxDepth: z
					.number()
					.int()
					.min(1)
					.optional()
					.default(2)
					.describe("Maximum depth to descend (default: 2). Similar to tree -L flag."),
				showHidden: z
					.boolean()
					.optional()
					.default(false)
					.describe('Show hidden files starting with "." (default: false).'),
				dirsOnly: z
					.boolean()
					.optional()
					.default(false)
					.describe("List directories only, no files (default: false)."),
				exclude: z
					.string()
					.optional()
					.describe('Name or glob to exclude (e.g., "node_modules"). Similar to tree -I flag.'),
				extension: z.string().optional().describe('Filter by file extension (e.g., ".ts").'),
				pattern: z
					.union([z.string(), z.array(z.string())])
					.optional()
					.describe(
						'Glob pattern(s), relative to path, that files must match. Use "**/*.ext" to match files recursively; "*" only matches within a single directory level.',
					),
			}),
			execute: async ({ path, ...options }, _call, root) =>
				listWorkspace(root, await resolveInside(root, path), options),
		}),
		gated(settings, (s) => s.approve_delete, {
			name: "workspace_delete",
			description: "Delete a file or directory from the workspace.",
			schema: z.object({
				path: z.string().describe("The path to the file or directory to delete"),
				recursive: z
					.boolean()
					.optional()
					.default(false)
					.describe(
						"If true, delete directories and their contents recursively. Required for non-empty directories.",
					),
			}),
			execute: async ({ path, recursive }, _call, root) => {
				const full = await resolveInside(root, path, true);
				if (full === root) throw new Error("The workspace itself cannot be deleted.");
				const info = await lstat(full).catch(() => null);
				if (info?.isDirectory() && !recursive)
					await rmdir(full).catch((error) => {
						if ((error as NodeJS.ErrnoException).code === "ENOTEMPTY")
							throw new Error(`${path} is not empty; pass recursive: true to delete it.`);
						throw error;
					});
				else await rm(full, { recursive });
				return `Deleted ${displayPath(root, full)}`;
			},
		}),
		gated(settings, (s) => s.approve_write, {
			name: "workspace_mkdir",
			description: "Create a directory in the workspace.",
			schema: z.object({
				path: z.string().describe("The path of the directory to create"),
				recursive: z
					.boolean()
					.optional()
					.default(true)
					.describe("Whether to create parent directories if they do not exist"),
			}),
			execute: async ({ path, recursive }, _call, root) => {
				const full = await resolveInside(root, path);
				await mkdir(full, { recursive });
				return `Created ${displayPath(root, full)}/`;
			},
		}),
		gated(settings, null, {
			name: "workspace_grep",
			description: `Search file contents in the workspace using a regex pattern. Returns matching lines with file paths and line numbers ("path:line:text").

Usage:
- Basic search: { pattern: "TODO" }
- Multiple terms: { pattern: "TODO|FIXME|HACK" }
- Case-insensitive: { pattern: "error", caseSensitive: false }
- Search in directory: { pattern: "import", path: "./src" }
- Filter by glob: { pattern: "import", path: "src/**/*.ts" }
- With context: { pattern: "function", contextLines: 2 }`,
			schema: z.object({
				pattern: z.string().min(1).describe("Regex pattern to search for"),
				path: z
					.string()
					.optional()
					.default(".")
					.describe(
						'File, directory, or glob pattern to search within (default: "."). A glob pattern (e.g., "**/*.ts") filters which files to search.',
					),
				contextLines: z
					.number()
					.int()
					.min(0)
					.optional()
					.default(0)
					.describe("Number of lines of context to include before and after each match"),
				maxCount: z
					.number()
					.int()
					.min(1)
					.optional()
					.describe("Maximum matches per file. Similar to grep -m flag."),
				caseSensitive: z
					.boolean()
					.optional()
					.default(true)
					.describe("Whether the search is case-sensitive (default: true)"),
				includeHidden: z
					.boolean()
					.optional()
					.default(false)
					.describe('Include hidden files and directories (names starting with ".")'),
			}),
			execute: async (input, _call, root) => grepWorkspace(root, input),
		}),
		gated(settings, (s) => s.approve_command, {
			name: "workspace_execute_command",
			description:
				settings.sandbox.provider === "docker"
					? `Run a shell command in your workspace's Linux container (image ${settings.sandbox.image}), where the workspace is ${MOUNT}. Output streams to the user as it runs; you get the exit code and the last lines of output. Commands cannot read input, so pass flags such as -y.`
					: `Run a shell command on the user's computer (${process.platform === "win32" ? "cmd.exe" : "sh"}), in the workspace folder. Output streams to the user as it runs; you get the exit code and the last lines of output. Commands cannot read input, so pass flags such as -y.`,
			schema: z.object({
				command: z
					.string()
					.min(1)
					.describe(
						'The shell command to execute (e.g., "npm install", "ls -la src/", "cat file.txt | grep error")',
					),
				timeout: z
					.number()
					.positive()
					.nullish()
					.describe(
						`Maximum execution time in seconds (at most ${settings.sandbox.timeout_sec}). Example: 60 for 1 minute.`,
					),
				cwd: z
					.string()
					.nullish()
					.describe("Working directory for the command, inside the workspace"),
				tail: z
					.number()
					.int()
					.min(0)
					.nullish()
					.describe(
						`Limit the output you get back to the last N lines, like tail -n. Defaults to ${DEFAULT_TAIL_LINES}. Use 0 for no limit.`,
					),
			}),
			execute: async ({ command, timeout, cwd, tail }, call, root) => {
				const s = settings.sandbox;
				const dir = await resolveInside(root, cwd ?? ".");
				const timeoutSec = Math.min(timeout ?? s.timeout_sec, s.timeout_sec);
				const running =
					s.provider === "docker"
						? spawnInContainer(
								await ensureContainer(call.context.characterId, s),
								command,
								inContainer(root, dir),
							)
						: spawnLocal(command, dir);
				return runCommand(running, call, timeoutSec, tail ?? DEFAULT_TAIL_LINES);
			},
		}),
	];
	return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
}

/** Stop and remove the character's container (its workspace's files stay). */
export async function resetSandbox(characterId: string, settings: AgentSettings): Promise<void> {
	if (!settings.sandbox.enabled) return;
	for (const cancel of runningCommands.get(characterId) ?? []) cancel();
	runningCommands.delete(characterId);
	if (settings.sandbox.provider !== "docker") return;
	await preparing.get(characterId)?.catch(() => {});
	const removed = await docker(["rm", "-f", containerName(characterId)], 60_000);
	if (removed.code !== 0 && !/no such container/i.test(removed.err))
		throw new Error(removed.err.split("\n")[0] || `exit ${removed.code}`);
}

/** Whether Docker answers, with its version and the running workspace containers, or the
 *  reason it does not. */
export async function dockerStatus(): Promise<DockerStatus> {
	try {
		const version = await docker(["version", "--format", "{{.Server.Version}}"]);
		if (version.code !== 0) {
			const error = version.err.split("\n")[0] || `exit ${version.code}`;
			return { ok: false, version: null, containers: null, error };
		}
		const ps = await docker(["ps", "-q", "--filter", "label=nextroom.workspace"]);
		const containers = ps.code === 0 ? ps.out.split("\n").filter(Boolean).length : null;
		return { ok: true, version: version.out, containers, error: null };
	} catch (error) {
		return {
			ok: false,
			version: null,
			containers: null,
			error: messageOf(error),
		};
	}
}
