// Programs the server runs (speech.cpp's `speech voice`, the sandbox's) end with it: on Windows a child
// outlives its parent unless it is killed.

import type { Subprocess } from "bun";

const children = new Set<Subprocess>();
let hooked = false;

function killAll(): void {
	for (const child of children) child.kill();
	children.clear();
}

function hook(): void {
	if (hooked) return;
	hooked = true;
	process.on("exit", killAll);
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
		process.once(signal, () => {
			killAll();
			process.exit(130);
		});
	}
}

/** `child`, killed when the server exits. */
export function track<T extends Subprocess>(child: T): T {
	hook();
	children.add(child);
	void child.exited.then(() => children.delete(child));
	return child;
}
