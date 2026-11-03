// The character's own Linux desktop: a Docker container per character (Xvfb, fluxbox, Chromium;
// packages/api/desktop) with its workspace at /workspace and its home in a volume of its own.
// The agent looks at it with computer_observe and works it with computer_act (xdotool); the user
// watches it through noVNC, relayed by the app (desktopSocket), and can take it over.
//
// A desktop no one has used or watched for a while is stopped; the next use starts it again.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DesktopView } from "@nextroom/contracts";
import { z } from "zod";
import { messageOf } from "../../lib/errors";
import type { AgentSettings } from "../../settings/agent";
import { type LlmConnection, modelOf } from "../providers";
import { defineTool, ImageResult, type ToolCall, type ToolSet } from "../tool";
import {
	type DockerResult,
	docker,
	dockerBytes,
	dockerError,
	dockerNetwork,
	workspaceMount,
} from "./docker";
import { MOUNT } from "./workspace-files";

type DesktopSettings = AgentSettings["desktop"];

const IMAGE_DIR = join(import.meta.dir, "../../../desktop");
const IMAGE_FILES = ["Dockerfile", "start.sh", "view.html"];
const VNC_PORT = 6080;
const WIDTH = 1280;
const HEIGHT = 800;
const BUILD_TIMEOUT_MS = 30 * 60_000;
const START_TIMEOUT_MS = 60_000;
const IDLE_MS = 15 * 60_000;
/** After the actions, before the screenshot: let the screen catch up. */
const SETTLE_MS = 600;

const containerName = (characterId: string) => `nextroom-desktop-${characterId}`;
const homeVolume = (characterId: string) => `nextroom-desktop-home-${characterId}`;

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
			throw new Error(`Could not build the desktop image: ${dockerError(built)}`);
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
function settingsHash(s: DesktopSettings, image: string, mount: string[]): string {
	return Bun.hash(JSON.stringify([image, s.memory_mb, s.cpus, mount, dockerNetwork()])).toString(
		36,
	);
}

interface Desktop {
	/** host:port of its websockify. */
	address: string;
	lastUsed: number;
}

/** The desktops started since the app started, by character. */
const desktops = new Map<string, Desktop>();
const preparing = new Map<string, Promise<Desktop>>();
const failures = new Map<string, string>();
/** Open screens per character; a desktop someone is watching is not stopped. */
const viewers = new Map<string, number>();

/** The character's running desktop, made or started when needed. */
export function ensureDesktop(characterId: string, s: DesktopSettings): Promise<Desktop> {
	const running = preparing.get(characterId);
	if (running) return running;
	const job = prepareDesktop(characterId, s)
		.then((desktop) => {
			failures.delete(characterId);
			desktops.set(characterId, desktop);
			startSweeping();
			return desktop;
		})
		.catch((error) => {
			failures.set(characterId, messageOf(error));
			throw error;
		})
		.finally(() => preparing.delete(characterId));
	preparing.set(characterId, job);
	return job;
}

async function prepareDesktop(characterId: string, s: DesktopSettings): Promise<Desktop> {
	const name = containerName(characterId);
	const image = await ensureImage();
	const mount = workspaceMount(characterId);
	const hash = settingsHash(s, image, mount);
	const info = await docker([
		"inspect",
		"--format",
		'{{index .Config.Labels "nextroom.settings"}} {{.State.Running}}',
		name,
	]);
	let ready = false;
	if (info.code === 0) {
		const [label, isRunning] = info.out.split(" ");
		if (label === hash) {
			// A running one whose screen is down is made again rather than trusted.
			ready =
				isRunning === "true"
					? await screenUp(name)
					: (await docker(["start", name], START_TIMEOUT_MS)).code === 0;
		}
		if (!ready) await docker(["rm", "-f", name], 60_000);
	}
	if (!ready) {
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
				...mount,
				"-v",
				`${homeVolume(characterId)}:/home/user`,
				image,
			],
			START_TIMEOUT_MS,
		);
		if (created.code !== 0)
			throw new Error(`Could not start the desktop container: ${dockerError(created)}`);
	}
	const address = await addressOf(name);
	await waitUntilUp(name, address);
	return { address, lastUsed: Date.now() };
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
	throw new Error("The desktop's screen did not come up in time.");
}

let sweeper: ReturnType<typeof setInterval> | null = null;

/** Stops the desktops no one has used or watched for IDLE_MS. */
function startSweeping(): void {
	sweeper ??= setInterval(() => {
		const now = Date.now();
		for (const [characterId, desktop] of desktops) {
			if ((viewers.get(characterId) ?? 0) > 0 || now - desktop.lastUsed < IDLE_MS) continue;
			desktops.delete(characterId);
			void docker(["stop", containerName(characterId)], 60_000);
		}
	}, 60_000);
	sweeper.unref?.();
}

/** Stops the character's desktop (its home and workspace stay). */
export async function stopDesktop(characterId: string): Promise<void> {
	await preparing.get(characterId)?.catch(() => {});
	desktops.delete(characterId);
	await docker(["stop", containerName(characterId)], 60_000);
}

/** Removes the character's desktop and its home, when the character goes. */
export async function removeDesktop(characterId: string): Promise<void> {
	if (!Bun.which("docker")) return;
	await preparing.get(characterId)?.catch(() => {});
	desktops.delete(characterId);
	failures.delete(characterId);
	await docker(["rm", "-f", containerName(characterId)], 60_000);
	await docker(["volume", "rm", "-f", homeVolume(characterId)], 60_000);
}

export async function desktopView(
	characterId: string,
	settings: AgentSettings,
): Promise<DesktopView> {
	const starting = preparing.has(characterId);
	const enabled = settings.desktop.enabled;
	if (!Bun.which("docker"))
		return { enabled, running: false, starting, error: "Docker が見つかりません" };
	const name = containerName(characterId);
	const state = await docker(["inspect", "--format", "{{.State.Running}}", name]);
	const up = !starting && state.code === 0 && state.out === "true" && (await screenUp(name));
	if (!up && !starting) desktops.delete(characterId);
	if (up && !desktops.has(characterId)) {
		// Left running from before the app restarted.
		const address = await addressOf(name).catch(() => null);
		if (address) {
			desktops.set(characterId, { address, lastUsed: Date.now() });
			startSweeping();
		}
	}
	return {
		enabled,
		running: up && desktops.has(characterId),
		starting,
		error: failures.get(characterId) ?? null,
	};
}

// Working the screen

const exec = (name: string, args: string[], detach = false) =>
	docker(
		[
			"exec",
			...(detach ? ["-d"] : []),
			"-u",
			"user",
			"-e",
			"DISPLAY=:1",
			"-e",
			"HOME=/home/user",
			"-w",
			MOUNT,
			name,
			...args,
		],
		30_000,
	);

async function screenshot(name: string, characterId: string): Promise<ImageResult> {
	const [jpeg, title] = await Promise.all([
		dockerBytes([
			"exec",
			"-u",
			"user",
			"-e",
			"DISPLAY=:1",
			name,
			"import",
			"-silent",
			"-window",
			"root",
			"-quality",
			"80",
			"jpeg:-",
		]),
		exec(name, ["xdotool", "getactivewindow", "getwindowname"]),
	]);
	if (!jpeg) {
		// Checked (and started again if need be) on the next use.
		desktops.delete(characterId);
		throw new Error("Could not take a screenshot of the desktop.");
	}
	const window = title.code === 0 && title.out ? ` The active window is "${title.out}".` : "";
	return new ImageResult(
		`The desktop now (${WIDTH}x${HEIGHT}; x and y are pixels from its top-left corner).${window}`,
		[{ data: Buffer.from(jpeg).toString("base64"), mimeType: "image/jpeg" }],
	);
}

const ACTION_KINDS = [
	"click",
	"double_click",
	"right_click",
	"move",
	"drag",
	"type",
	"key",
	"scroll",
	"wait",
	"open_browser",
	"open_terminal",
] as const;

const coordinate = (max: number) =>
	z
		.number()
		.int()
		.min(0)
		.max(max - 1);

const actionSchema = z.object({
	kind: z
		.enum(ACTION_KINDS)
		.describe(
			"click / double_click / right_click / move: at x, y. drag: from x, y to to_x, to_y. type: text. key: key. scroll: direction and amount, at x, y if given. wait: ms. open_browser: Chromium, at url if given. open_terminal: a terminal in /workspace.",
		),
	x: coordinate(WIDTH).optional(),
	y: coordinate(HEIGHT).optional(),
	to_x: coordinate(WIDTH).optional(),
	to_y: coordinate(HEIGHT).optional(),
	text: z.string().max(5000).optional().describe("For type: the text to type."),
	key: z
		.string()
		.max(100)
		.optional()
		.describe(
			'For key: xdotool key names, e.g. "Return", "Escape", "ctrl+l", "ctrl+shift+t", "BackSpace"; several separated by spaces are pressed in turn.',
		),
	direction: z.enum(["up", "down", "left", "right"]).optional(),
	amount: z.number().int().min(1).max(20).optional().describe("For scroll: notches (default 3)."),
	ms: z.number().int().min(0).max(5000).optional().describe("For wait: milliseconds."),
	url: z.string().max(2000).optional(),
});

type Action = z.infer<typeof actionSchema>;

const SCROLL_BUTTONS = { up: "4", down: "5", left: "6", right: "7" } as const;

function at(action: Action, name = "x, y"): [string, string] {
	if (action.x === undefined || action.y === undefined)
		throw new Error(`${action.kind} needs ${name}.`);
	return [String(action.x), String(action.y)];
}

/** The xdotool arguments of one action, or what else to do. */
function plan(action: Action): { xdotool: string[] } | { wait: number } | { launch: string[] } {
	switch (action.kind) {
		case "click":
		case "double_click":
		case "right_click": {
			const button = action.kind === "right_click" ? "3" : "1";
			const repeat = action.kind === "double_click" ? ["--repeat", "2", "--delay", "80"] : [];
			return { xdotool: ["mousemove", "--sync", ...at(action), "click", ...repeat, button] };
		}
		case "move":
			return { xdotool: ["mousemove", "--sync", ...at(action)] };
		case "drag": {
			if (action.to_x === undefined || action.to_y === undefined)
				throw new Error("drag needs to_x, to_y.");
			return {
				xdotool: [
					"mousemove",
					"--sync",
					...at(action),
					"mousedown",
					"1",
					"mousemove",
					"--sync",
					String(action.to_x),
					String(action.to_y),
					"mouseup",
					"1",
				],
			};
		}
		case "type":
			if (!action.text) throw new Error("type needs text.");
			return { xdotool: ["type", "--delay", "15", "--clearmodifiers", "--", action.text] };
		case "key": {
			const keys = action.key?.trim().split(/\s+/).filter(Boolean) ?? [];
			if (!keys.length) throw new Error("key needs key.");
			return { xdotool: ["key", "--clearmodifiers", "--", ...keys] };
		}
		case "scroll": {
			const move = action.x !== undefined ? ["mousemove", "--sync", ...at(action)] : [];
			const button = SCROLL_BUTTONS[action.direction ?? "down"];
			const repeat = String(action.amount ?? 3);
			return { xdotool: [...move, "click", "--repeat", repeat, "--delay", "40", button] };
		}
		case "wait":
			return { wait: action.ms ?? 500 };
		case "open_browser":
			return {
				launch: [
					"chromium",
					"--no-sandbox",
					"--test-type",
					"--no-first-run",
					"--no-default-browser-check",
					"--start-maximized",
					...(action.url ? [action.url] : []),
				],
			};
		case "open_terminal":
			return { launch: ["xterm", "-fa", "Noto Sans Mono CJK JP", "-fs", "11"] };
	}
}

const describeAction = (a: Action) =>
	[a.kind, a.x !== undefined ? `${a.x},${a.y}` : "", a.text ?? a.key ?? a.url ?? ""]
		.filter(Boolean)
		.join(" ");

/** Whether the model can be shown screenshots; the desktop is no use to one that cannot. */
const seesImages = (connection: LlmConnection) => modelOf(connection).input.includes("image");

export const hasDesktop = (settings: AgentSettings, connection: LlmConnection) =>
	settings.desktop.enabled && seesImages(connection);

async function desktopFor(call: ToolCall, settings: AgentSettings): Promise<string> {
	const { characterId } = call.context;
	let desktop = desktops.get(characterId);
	if (!desktop) {
		call.output("デスクトップを起動しています…\n");
		desktop = await ensureDesktop(characterId, settings.desktop);
	}
	desktop.lastUsed = Date.now();
	return containerName(characterId);
}

/** A command on the desktop failed; if the container is gone, it is started again next time. */
function failed(characterId: string, what: string, result: DockerResult): Error {
	if (/is not running|no such container/i.test(result.err)) desktops.delete(characterId);
	return new Error(`${what} failed: ${dockerError(result)}`);
}

export function desktopTools(settings: AgentSettings, connection: LlmConnection): ToolSet {
	if (!hasDesktop(settings, connection)) return {};
	return {
		computer_observe: defineTool({
			name: "computer_observe",
			description: `Look at your desktop: a screenshot of the whole screen (${WIDTH}x${HEIGHT}). Look before you click at coordinates, and again whenever the screen may have changed (the user can use it too).`,
			schema: z.object({}),
			sequential: true,
			execute: async (_input, call) =>
				screenshot(await desktopFor(call, settings), call.context.characterId),
		}),
		computer_act: defineTool({
			name: "computer_act",
			description: `Work your desktop: click, type, press keys, scroll, or open the browser or a terminal. The actions run in order; then you get a screenshot unless observe is false. Coordinates are pixels of the ${WIDTH}x${HEIGHT} screen, as in the last screenshot. Batch actions whose outcome you can predict; look again when unsure.`,
			schema: z.object({
				actions: z.array(actionSchema).min(1).max(20),
				observe: z
					.boolean()
					.optional()
					.default(true)
					.describe("Take a screenshot after the actions (default true)."),
			}),
			sequential: true,
			changes: true,
			execute: async ({ actions, observe }, call) => {
				const steps = actions.map(plan);
				const name = await desktopFor(call, settings);
				for (const [index, step] of steps.entries()) {
					if (call.signal.aborted) throw new Error("Cancelled.");
					const action = actions[index] as Action;
					call.output(`${describeAction(action)}\n`);
					if ("wait" in step) await Bun.sleep(step.wait);
					else if ("launch" in step) await exec(name, step.launch, true);
					else {
						const done = await exec(name, ["xdotool", ...step.xdotool]);
						if (done.code !== 0) throw failed(call.context.characterId, action.kind, done);
					}
				}
				const desktop = desktops.get(call.context.characterId);
				if (desktop) desktop.lastUsed = Date.now();
				if (!observe) return `Done: ${actions.length} action(s).`;
				await Bun.sleep(SETTLE_MS);
				return screenshot(name, call.context.characterId);
			},
		}),
	};
}

// The screen, relayed to the app's page

/** The page that shows the screen (noVNC), served from the container. */
export async function desktopPage(characterId: string, path: string): Promise<Response> {
	const desktop = desktops.get(characterId);
	if (!desktop) return new Response("The desktop is not running.", { status: 404 });
	const upstream = await fetch(`http://${desktop.address}/${path}`).catch(() => null);
	if (!upstream) return new Response("The desktop did not answer.", { status: 502 });
	const headers = new Headers();
	for (const key of ["content-type", "content-length", "last-modified"]) {
		const value = upstream.headers.get(key);
		if (value) headers.set(key, value);
	}
	headers.set("cache-control", "no-store");
	return new Response(upstream.body, { status: upstream.status, headers });
}

export interface DesktopSocketData {
	characterId: string;
	token: "view" | "control";
	upstream: WebSocket | null;
	pending: (string | Buffer<ArrayBuffer>)[];
}

const SOCKET_PATH = /^\/api\/desktops\/([^/]+)\/vnc\/websockify$/;

/** Takes the page's websocket for the screen, if this is one; true when it did. */
export function upgradeDesktopSocket(req: Request, server: Bun.Server<DesktopSocketData>): boolean {
	if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return false;
	const url = new URL(req.url);
	const match = SOCKET_PATH.exec(url.pathname);
	if (!match?.[1] || !desktops.has(decodeURIComponent(match[1]))) return false;
	const token = url.searchParams.get("token") === "control" ? "control" : "view";
	const data: DesktopSocketData = {
		characterId: decodeURIComponent(match[1]),
		token,
		upstream: null,
		pending: [],
	};
	return server.upgrade(req, { data });
}

/** Bun's websocket handlers for the screen: each page's socket is joined to the container's. */
export const desktopSocket: Bun.WebSocketHandler<DesktopSocketData> = {
	open(ws) {
		const { characterId, token } = ws.data;
		const desktop = desktops.get(characterId);
		if (!desktop) {
			ws.close(1011, "The desktop is not running.");
			return;
		}
		viewers.set(characterId, (viewers.get(characterId) ?? 0) + 1);
		desktop.lastUsed = Date.now();
		const upstream = new WebSocket(`ws://${desktop.address}/websockify?token=${token}`);
		upstream.binaryType = "arraybuffer";
		ws.data.upstream = upstream;
		upstream.onopen = () => {
			for (const message of ws.data.pending) upstream.send(message);
			ws.data.pending = [];
		};
		upstream.onmessage = (event) => ws.send(event.data as ArrayBuffer);
		upstream.onclose = () => ws.close();
		upstream.onerror = () => ws.close();
	},
	message(ws, message) {
		const upstream = ws.data.upstream;
		if (upstream?.readyState === WebSocket.OPEN) upstream.send(message);
		else ws.data.pending.push(typeof message === "string" ? message : message.slice());
	},
	close(ws) {
		const { characterId } = ws.data;
		viewers.set(characterId, Math.max(0, (viewers.get(characterId) ?? 1) - 1));
		const desktop = desktops.get(characterId);
		if (desktop) desktop.lastUsed = Date.now();
		ws.data.upstream?.close();
	},
};
