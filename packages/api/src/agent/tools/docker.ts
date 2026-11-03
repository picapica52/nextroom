// The docker CLI, for the characters' computers (computer.ts).
//
// When the app itself runs in a container (compose.yaml), NEXTROOM_DOCKER_NETWORK names the
// network the app is on, so that it reaches the computers by their names.

import { track } from "../../lib/children";

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
