// The agent's shell (execute_command) in the character's computer (computer.ts), through
// `docker exec` as its user, in /workspace, the workspace the user sees in the files tab. Files are
// read, written and searched with commands too.

import type { DockerStatus } from "@nextroom/contracts";
import type { Subprocess } from "bun";
import { z } from "zod";
import { track } from "../../lib/children";
import { messageOf } from "../../lib/errors";
import type { AgentSettings } from "../../settings/agent";
import { defineTool, type ToolCall, type ToolSet } from "../tool";
import { asUser, containerName, holdComputer, useComputer, WORKSPACE } from "./computer";
import { docker } from "./docker";

const DEFAULT_TAIL_LINES = 200;
const MAX_RESULT_CHARS = 20_000;
const KEEP_OUTPUT_CHARS = 200_000;

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

/** Commands running now, by character, so that resetting the computer stops them. */
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

export function commandTools(settings: AgentSettings): ToolSet {
	if (!settings.computer.enabled) return {};
	const tool = defineTool({
		changes: true,
		name: "execute_command",
		description: `Run a shell command (sh) on your own Linux computer (Debian), as the user "user", in ${WORKSPACE} unless cwd says otherwise. sudo works without a password, e.g. to apt-get install packages. Output streams to the user as it runs; you get the exit code and the last lines of output. Commands cannot read input, so pass flags such as -y. Work with files through it too: cat or sed -n to read, ls, find and grep to look around, a heredoc or a short script to write or change one.`,
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
					`Maximum execution time in seconds (at most ${settings.computer.timeout_sec}). Example: 60 for 1 minute.`,
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
			const limit = settings.computer.timeout_sec;
			const timeoutSec = Math.min(timeout ?? limit, limit);
			await useComputer(characterId, settings.computer);
			const running = spawnInComputer(characterId, command, cwdOf(cwd));
			return runCommand(running, call, timeoutSec, tail ?? DEFAULT_TAIL_LINES);
		},
	});
	return { [tool.name]: tool };
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
