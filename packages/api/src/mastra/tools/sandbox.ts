// The agent's file and command tools: a Mastra workspace whose files are the character's
// workspace (workspaces/store.ts) and whose commands run in a Docker container with that
// folder mounted at /workspace (one container per character). Claude Agent SDK works in the same
// workspace, so what one makes the other can use, and the user can download it from the files tab.
//
// On Windows the "local" provider runs commands on this PC with no isolation at all; Docker
// (Docker Desktop) is the one that keeps them in a box.

import { RequestContext } from "@mastra/core/request-context";
import {
	LocalFilesystem,
	LocalSandbox,
	WORKSPACE_TOOLS,
	Workspace,
	type WorkspaceToolHookContext,
} from "@mastra/core/workspace";
import { DockerSandbox } from "@mastra/docker";
import type { DockerStatus } from "@nextroom/contracts";
import { track } from "../../lib/children";
import { messageOf } from "../../lib/errors";
import type { AgentSettings } from "../../settings/agent";
import { workspaceDir } from "../../workspaces/store";
import { contextValue, toolCallIdOf, type WithContext } from "../context";
import { DECLINED } from "../prompts";

const WRITES: string[] = [
	WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE,
	WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE,
	WORKSPACE_TOOLS.FILESYSTEM.MKDIR,
	WORKSPACE_TOOLS.FILESYSTEM.AST_EDIT,
];
const COMMANDS: string[] = [
	WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND,
	WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS,
];

/** Whether the settings ask the user before this workspace tool runs. */
function needsApproval(tool: string, settings: AgentSettings): boolean {
	const s = settings.sandbox;
	if (COMMANDS.includes(tool)) return s.approve_command;
	if (WRITES.includes(tool)) return s.approve_write;
	if (tool === WORKSPACE_TOOLS.FILESYSTEM.DELETE) return s.approve_delete;
	return false;
}

/** Before a workspace tool runs: ask the user when the settings say so. */
async function gate(hook: WorkspaceToolHookContext) {
	const context = hook.context as WithContext;
	const settings = contextValue(context, "settings");
	const reporter = contextValue(context, "reporter");
	const toolCallId = toolCallIdOf(hook.context);
	if (!settings || !reporter || !toolCallId) return;
	if (!needsApproval(hook.workspaceToolName, settings)) return;
	if (await reporter.approve(toolCallId, hook.toolName, hook.input)) return;
	return { proceed: false as const, output: DECLINED.sandbox };
}

const containerId = (characterId: string) => `nextroom-${characterId}`;

function sandboxFor(characterId: string, settings: AgentSettings) {
	const s = settings.sandbox;
	const dir = workspaceDir(characterId);
	if (s.provider === "local") {
		return new LocalSandbox({
			id: `local-${containerId(characterId)}`,
			workingDirectory: dir,
			timeout: s.timeout_sec * 1000,
		});
	}
	return new DockerSandbox({
		id: containerId(characterId),
		image: s.image,
		mounts: [{ type: "bind", source: dir, target: "/workspace" }],
		workingDir: "/workspace",
		memory: s.memory_mb * 1024 * 1024,
		cpuPeriod: 100_000,
		cpuQuota: Math.round(s.cpus * 100_000),
		...(s.network ? {} : { network: "none" }),
		timeout: s.timeout_sec * 1000,
		labels: { "nextroom.workspace": characterId },
	});
}

const characterOf = (context: { requestContext: unknown }) => {
	const characterId = contextValue(context as WithContext, "characterId");
	if (!characterId) throw new Error("workspace tools used outside a conversation");
	return characterId;
};

let current: { key: string; workspace: Workspace } | null = null;

/** The workspace for the current settings, or undefined while the tools are off. */
export function sandboxWorkspace(settings: AgentSettings): Workspace | undefined {
	if (!settings.sandbox.enabled) return undefined;
	const key = JSON.stringify(settings.sandbox);
	if (current?.key === key) return current.workspace;
	const previous = current?.workspace;
	const workspace = new Workspace({
		id: "character-workspace",
		name: "ワークスペース",
		filesystem: (context) => new LocalFilesystem({ basePath: workspaceDir(characterOf(context)) }),
		sandbox: (context) => sandboxFor(characterOf(context), settings),
		sandboxCacheKey: (context) => characterOf(context),
		tools: { hooks: { beforeToolCall: gate } },
	});
	current = { key, workspace };
	// Containers made with the old settings go; the next command starts a new one.
	void previous
		?.destroy()
		.catch((error) => console.warn("Could not remove the previous sandbox workspace:", error));
	return workspace;
}

/** Stop and remove the character's container (its workspace's files stay). */
export async function resetSandbox(characterId: string, settings: AgentSettings): Promise<void> {
	const workspace = sandboxWorkspace(settings);
	if (!workspace) return;
	const requestContext = new RequestContext();
	requestContext.set("characterId", characterId);
	const sandbox = await workspace.resolveSandbox({ requestContext });
	await sandbox?.destroy?.();
	workspace.clearSandboxCache(characterId);
}

/** A docker command's output, killed after 10 seconds. */
async function docker(args: string[]): Promise<{ code: number; out: string; err: string }> {
	const proc = track(
		Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe", windowsHide: true }),
	);
	const timer = setTimeout(() => proc.kill(), 10_000);
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
