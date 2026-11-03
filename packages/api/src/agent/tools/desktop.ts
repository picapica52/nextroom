// The screen of the character's computer (computer.ts): Xvfb, fluxbox and Chromium. The agent
// looks at it with computer_observe and works it with computer_act, both through a program kept
// running in the computer (control.py); the user watches it through noVNC, relayed by the app
// (desktopSocket), and can take it over.

import type { DesktopView } from "@nextroom/contracts";
import { z } from "zod";
import { track } from "../../lib/children";
import { messageOf } from "../../lib/errors";
import type { AgentSettings } from "../../settings/agent";
import { type LlmConnection, modelOf } from "../providers";
import { defineTool, ImageResult, type ToolCall, type ToolSet } from "../tool";
import {
	asUser,
	computerState,
	forgetComputer,
	onComputerGone,
	runningComputer,
	useComputer,
	watchComputer,
} from "./computer";

const WIDTH = 1280;
const HEIGHT = 800;
/** After the actions, before the screenshot: let the screen catch up. */
const SETTLE_MS = 600;
const COMMAND_TIMEOUT_MS = 40_000;
/** The same actions leaving the screen as it was this many times in a row are not run again. */
const MAX_UNCHANGED_REPEATS = 3;

export async function desktopView(
	characterId: string,
	settings: AgentSettings,
): Promise<DesktopView> {
	return { enabled: settings.computer.enabled, ...(await computerState(characterId)) };
}

// Working the screen: requests to control.py, one JSON line each way

interface ControlAnswer {
	id: number;
	error?: string;
	image?: string;
	frame?: string;
	title?: string;
}

interface Control {
	proc: Bun.Subprocess<"pipe", "pipe", "ignore">;
	pending: Map<number, (answer: ControlAnswer | Error) => void>;
	next: number;
}

const controls = new Map<string, Control>();

function controlFor(characterId: string): Control {
	const running = controls.get(characterId);
	if (running) return running;
	const [exec, ...args] = asUser(characterId);
	const proc = track(
		Bun.spawn(
			["docker", exec as string, "-i", ...args, "python3", "/usr/local/bin/nextroom-control"],
			{ stdin: "pipe", stdout: "pipe", stderr: "ignore", windowsHide: true },
		),
	);
	const control: Control = { proc, pending: new Map(), next: 1 };
	controls.set(characterId, control);
	void readAnswers(control);
	void proc.exited.then(() => {
		// Stopped by itself, not by closeControl: the container may be gone; checked on the next use.
		if (controls.get(characterId) === control) {
			controls.delete(characterId);
			forgetComputer(characterId);
		}
		for (const settle of control.pending.values())
			settle(new Error("The desktop's control program stopped."));
		control.pending.clear();
	});
	return control;
}

async function readAnswers(control: Control): Promise<void> {
	const decoder = new TextDecoder();
	let buffered = "";
	for await (const chunk of control.proc.stdout) {
		buffered += decoder.decode(chunk, { stream: true });
		const lines = buffered.split("\n");
		buffered = lines.pop() ?? "";
		for (const line of lines) {
			if (!line.trim()) continue;
			let answer: ControlAnswer;
			try {
				answer = JSON.parse(line) as ControlAnswer;
			} catch {
				control.proc.kill();
				return;
			}
			control.pending.get(answer.id)?.(answer);
			control.pending.delete(answer.id);
		}
	}
}

function closeControl(characterId: string): void {
	const control = controls.get(characterId);
	controls.delete(characterId);
	control?.proc.kill();
}

onComputerGone(closeControl);

function command(characterId: string, request: Record<string, unknown>): Promise<ControlAnswer> {
	const control = controlFor(characterId);
	const id = control.next++;
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			control.pending.delete(id);
			// What it is doing is unknown now; the next request starts it again.
			if (controls.get(characterId) === control) closeControl(characterId);
			reject(new Error("The desktop did not answer in time."));
		}, COMMAND_TIMEOUT_MS);
		control.pending.set(id, (answer) => {
			clearTimeout(timer);
			if (answer instanceof Error) reject(answer);
			else if (answer.error) reject(new Error(answer.error));
			else resolve(answer);
		});
		try {
			control.proc.stdin.write(`${JSON.stringify({ id, ...request })}\n`);
			control.proc.stdin.flush();
		} catch (error) {
			control.pending.delete(id);
			clearTimeout(timer);
			reject(new Error(`The desktop's control program is not running: ${messageOf(error)}`));
		}
	});
}

interface Screen {
	image: string;
	/** A hash of the pixels: the same frame means the screen has not changed. */
	frame: string;
	title: string;
}

async function look(characterId: string): Promise<Screen> {
	const answer = await command(characterId, { capture: true });
	if (!answer.image || !answer.frame)
		throw new Error("Could not take a screenshot of the desktop.");
	return { image: answer.image, frame: answer.frame, title: answer.title ?? "" };
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
	settings.computer.enabled && seesImages(connection);

/** The character's computer, started when need be. */
async function computerFor(call: ToolCall, settings: AgentSettings): Promise<string> {
	const { characterId } = call.context;
	if (!runningComputer(characterId)) call.output("コンピューターを起動しています…\n");
	await useComputer(characterId, settings.computer);
	return characterId;
}

export function desktopTools(settings: AgentSettings, connection: LlmConnection): ToolSet {
	if (!hasDesktop(settings, connection)) return {};
	// Made for each reply, as the screenshots are: the model sees them within one reply only
	// (agent/index.ts), so a frame it was shown in this reply need not be shown again.
	let shown: string | null = null;
	let repeats = { key: "", count: 0 };

	const show = (screen: Screen, afterActions = false): ImageResult | string => {
		const window = screen.title ? ` The active window is "${screen.title}".` : "";
		if (screen.frame === shown)
			return `${afterActions ? "The screen did not change." : "The screen is the same as in your last screenshot."} It is not shown again.${window}`;
		shown = screen.frame;
		return new ImageResult(
			`The desktop now (${WIDTH}x${HEIGHT}; x and y are pixels from its top-left corner).${window}`,
			[{ data: screen.image, mimeType: "image/jpeg" }],
		);
	};

	return {
		computer_observe: defineTool({
			name: "computer_observe",
			description: `Look at your desktop: a screenshot of the whole screen (${WIDTH}x${HEIGHT}). Look before you click at coordinates, and again whenever the screen may have changed (the user can use it too).`,
			schema: z.object({}),
			sequential: true,
			execute: async (_input, call) => show(await look(await computerFor(call, settings))),
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
				const key = JSON.stringify(actions);
				if (repeats.key === key && repeats.count >= MAX_UNCHANGED_REPEATS)
					return `Not run: these same actions have left the screen unchanged ${repeats.count} times in a row. Try something else: another place or element, a keyboard shortcut, or look again with computer_observe.`;
				const characterId = await computerFor(call, settings);
				const before = shown;
				for (const [index, step] of steps.entries()) {
					if (call.signal.aborted) throw new Error("Cancelled.");
					const action = actions[index] as Action;
					call.output(`${describeAction(action)}\n`);
					if ("wait" in step) await Bun.sleep(step.wait);
					else
						await command(characterId, step).catch((error) => {
							throw new Error(`${action.kind} failed: ${messageOf(error)}`);
						});
				}
				const computer = runningComputer(characterId);
				if (computer) computer.lastUsed = Date.now();
				if (!observe) {
					repeats = { key: "", count: 0 };
					return `Done: ${actions.length} action(s).`;
				}
				await Bun.sleep(SETTLE_MS);
				const screen = await look(characterId);
				const unchanged =
					before !== null && screen.frame === before && actions.some((a) => a.kind !== "wait");
				repeats = unchanged
					? { key, count: repeats.key === key ? repeats.count + 1 : 1 }
					: { key: "", count: 0 };
				return show(screen, true);
			},
		}),
	};
}

// The screen, relayed to the app's page

/** The page that shows the screen (noVNC), served from the container. */
export async function desktopPage(characterId: string, path: string): Promise<Response> {
	const desktop = runningComputer(characterId);
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
	if (!match?.[1] || !runningComputer(decodeURIComponent(match[1]))) return false;
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
		const desktop = runningComputer(characterId);
		if (!desktop) {
			ws.close(1011, "The desktop is not running.");
			return;
		}
		watchComputer(characterId, 1);
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
		watchComputer(ws.data.characterId, -1);
		ws.data.upstream?.close();
	},
};
