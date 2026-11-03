// The agent's file and command tools (workspace_*), all in the character's computer
// (computer.ts): the file tools through files.py in it, the commands through `docker exec`, as its
// user. Paths may be anywhere in the computer; relative ones are under /workspace, the workspace
// the user sees in the files tab.

import type { DockerStatus } from "@nextroom/contracts";
import type { Subprocess } from "bun";
import { z } from "zod";
import { track } from "../../lib/children";
import { messageOf } from "../../lib/errors";
import type { AgentSettings } from "../../settings/agent";
import { type CharacterTool, defineTool, type ToolCall, type ToolSet } from "../tool";
import {
	asUser,
	containerName,
	fileRequest,
	holdComputer,
	useComputer,
	WORKSPACE,
} from "./computer";
import { docker } from "./docker";

const DEFAULT_TAIL_LINES = 200;
const MAX_RESULT_CHARS = 20_000;
const KEEP_OUTPUT_CHARS = 200_000;

/** A file tool: its input sent to files.py in the computer as the request `op`. */
function fileTool<S extends z.ZodType>(
	settings: AgentSettings,
	op: string,
	changes: boolean,
	tool: { name: string; description: string; schema: S },
): CharacterTool {
	return defineTool({
		...tool,
		changes,
		execute: (input, call) =>
			fileRequest<string>(call.context.characterId, settings.container, {
				...(input as Record<string, unknown>),
				op,
			}),
	});
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

function spawnInComputer(characterId: string, command: string, cwd: string): Running {
	const pidFile = `/tmp/.nextroom/${crypto.randomUUID()}`;
	const proc = track(
		Bun.spawn(
			["docker", ...asUser(characterId, cwd), "sh", "-c", SPAWN_WRAPPER, "sh", pidFile, command],
			{ stdin: "ignore", stdout: "pipe", stderr: "pipe", windowsHide: true },
		),
	);
	const kill = () => {
		void docker([
			"exec",
			containerName(characterId),
			"sh",
			"-c",
			KILL_SCRIPT,
			"sh",
			pidFile,
		]).finally(() => setTimeout(() => proc.kill(), 2000));
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
	const release = holdComputer(characterId);
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
		release();
	}
}

/** A working directory as the computer sees it: relative ones are under /workspace. */
const cwdOf = (cwd: string | null | undefined) => {
	const given = cwd?.trim().replaceAll("\\", "/");
	if (!given || given === ".") return WORKSPACE;
	if (given.startsWith("/")) return given;
	if (given === "~" || given.startsWith("~/")) return `/home/user${given.slice(1)}`;
	return `${WORKSPACE}/${given.replace(/^\.\//, "")}`;
};

// Tools

export function sandboxTools(settings: AgentSettings): ToolSet {
	if (!settings.sandbox.enabled) return {};
	const tools = [
		fileTool(settings, "read", false, {
			name: "workspace_read_file",
			description:
				"Read a file on your computer (relative paths are under /workspace). Text files come back as text with line numbers — use offset/limit to read a line range from large files. Binary files return only their metadata (path, size, type) unless you ask for an encoding.",
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
		}),
		fileTool(settings, "write", true, {
			name: "workspace_write_file",
			description:
				"Write content to a file on your computer (relative paths are under /workspace). Creates parent directories if needed.",
			schema: z.object({
				path: z.string().describe('The path where to write the file (e.g., "data/output.txt")'),
				content: z.string().describe("The content to write to the file"),
				overwrite: z
					.boolean()
					.optional()
					.default(true)
					.describe("Whether to overwrite the file if it already exists"),
			}),
		}),
		fileTool(settings, "edit", true, {
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
		}),
		fileTool(settings, "list", false, {
			name: "workspace_list_files",
			description: `List files and directories on your computer (relative paths are under /workspace).
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
		}),
		fileTool(settings, "delete", true, {
			name: "workspace_delete",
			description:
				"Delete a file or directory on your computer (relative paths are under /workspace).",
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
		}),
		fileTool(settings, "mkdir", true, {
			name: "workspace_mkdir",
			description: "Create a directory on your computer (relative paths are under /workspace).",
			schema: z.object({
				path: z.string().describe("The path of the directory to create"),
				recursive: z
					.boolean()
					.optional()
					.default(true)
					.describe("Whether to create parent directories if they do not exist"),
			}),
		}),
		fileTool(settings, "grep", false, {
			name: "workspace_grep",
			description: `Search file contents on your computer (relative paths are under /workspace) using a regex pattern (Python syntax). Returns matching lines with file paths and line numbers ("path:line:text").

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
		}),
		defineTool({
			changes: true,
			name: "workspace_execute_command",
			description: `Run a shell command (sh) on your own Linux computer (Debian), as the user "user", in ${WORKSPACE} unless cwd says otherwise. sudo works without a password, e.g. to apt-get install packages. Output streams to the user as it runs; you get the exit code and the last lines of output. Commands cannot read input, so pass flags such as -y.`,
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
					.describe(
						`Working directory for the command (default ${WORKSPACE}; relative paths are under it)`,
					),
				tail: z
					.number()
					.int()
					.min(0)
					.nullish()
					.describe(
						`Limit the output you get back to the last N lines, like tail -n. Defaults to ${DEFAULT_TAIL_LINES}. Use 0 for no limit.`,
					),
			}),
			execute: async ({ command, timeout, cwd, tail }, call) => {
				const { characterId } = call.context;
				const limit = settings.sandbox.timeout_sec;
				const timeoutSec = Math.min(timeout ?? limit, limit);
				await useComputer(characterId, settings.container);
				const running = spawnInComputer(characterId, command, cwdOf(cwd));
				return runCommand(running, call, timeoutSec, tail ?? DEFAULT_TAIL_LINES);
			},
		}),
	];
	return Object.fromEntries(tools.map((tool) => [tool.name, tool]));
}

/** Stops the commands the character is running (its computer stays). */
export function stopCommands(characterId: string): void {
	for (const cancel of runningCommands.get(characterId) ?? []) cancel();
	runningCommands.delete(characterId);
}

/** Whether Docker answers, with its version and the running computers, or the
 *  reason it does not. */
export async function dockerStatus(): Promise<DockerStatus> {
	try {
		const version = await docker(["version", "--format", "{{.Server.Version}}"]);
		if (version.code !== 0) {
			const error = version.err.split("\n")[0] || `exit ${version.code}`;
			return { ok: false, version: null, containers: null, error };
		}
		const ps = await docker(["ps", "-q", "--filter", "label=nextroom.desktop"]);
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
