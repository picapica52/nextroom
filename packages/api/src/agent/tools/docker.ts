// The docker CLI, shared by the workspace's container (sandbox.ts) and the desktop (desktop.ts).
//
// When the app itself runs in a container (compose.yaml), its paths are not the host's, so a
// container it makes cannot bind-mount them. NEXTROOM_DOCKER_DATA_VOLUME names the volume the
// data folder lives in, and the workspace is mounted from it instead; NEXTROOM_DOCKER_NETWORK
// names the network the app is on, so that it reaches the desktops by their names.

import { relative, sep } from "node:path";
import { track } from "../../lib/children";
import { dataDir } from "../../lib/config";
import { workspaceDir } from "../../workspaces/store";
import { MOUNT } from "./workspace-files";

export interface DockerResult {
	code: number;
	out: string;
	err: string;
}

/** A docker command's output, killed after `timeoutMs`. */
export async function docker(args: string[], timeoutMs = 10_000): Promise<DockerResult> {
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

/** A docker command's raw stdout (an image), or null when it fails. */
export async function dockerBytes(args: string[], timeoutMs = 15_000): Promise<Uint8Array | null> {
	const proc = track(
		Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "ignore", windowsHide: true }),
	);
	const timer = setTimeout(() => proc.kill(), timeoutMs);
	try {
		const [out, code] = await Promise.all([new Response(proc.stdout).bytes(), proc.exited]);
		return code === 0 && out.length ? out : null;
	} finally {
		clearTimeout(timer);
	}
}

/** The last line of a failed command's stderr. */
export const dockerError = (result: DockerResult) =>
	result.err.split("\n").at(-1) || `exit ${result.code}`;

const env = (name: string) => process.env[name]?.trim() || null;

export const dockerNetwork = () => env("NEXTROOM_DOCKER_NETWORK");

/** The `docker run` arguments that mount the character's workspace at /workspace. */
export function workspaceMount(characterId: string): string[] {
	const dir = workspaceDir(characterId);
	const volume = env("NEXTROOM_DOCKER_DATA_VOLUME");
	if (!volume) return ["-v", `${dir}:${MOUNT}`];
	const subpath = relative(dataDir(), dir).split(sep).join("/");
	return ["--mount", `type=volume,src=${volume},dst=${MOUNT},volume-subpath=${subpath}`];
}
