// The browser: Chrome on this PC driven by Stagehand (v3, through @mastra/stagehand), one
// browser per conversation. The agent gets Stagehand's tools (stagehand_navigate / act /
// extract / observe / tabs / screenshot / close); act and navigate can be set to ask first.
//
// While a conversation's browser is open, its page streams as JPEG frames (Chrome's
// screencast) that the app shows, and the user can take over by clicking and typing into it.
// Stagehand reads pages with the conversation's own LLM (an OpenAI-compatible endpoint or Claude).

import type { MouseEventParams, ScreencastStream } from "@mastra/core/browser";
import { createStagehandTools, STAGEHAND_TOOLS, StagehandBrowser } from "@mastra/stagehand";
import type { BrowserInput, BrowserView } from "@nextroom/contracts";
import type { AgentSettings } from "../../settings/agent";
import { contextValue, toolCallIdOf } from "../context";
import { DECLINED } from "../prompts";
import { type LlmConnection, stagehandModel } from "../providers";

const VIEWPORT = { width: 1280, height: 720 };

let current: { key: string; browser: StagehandBrowser } | null = null;

function browserFor(settings: AgentSettings, connection: LlmConnection): StagehandBrowser {
	const key = JSON.stringify([settings.browser.headless, connection]);
	if (current?.key === key) return current.browser;
	const previous = current?.browser;
	const browser = new StagehandBrowser({
		env: "LOCAL",
		headless: settings.browser.headless,
		scope: "thread",
		viewport: VIEWPORT,
		model: stagehandModel(connection),
		verbose: 0,
	});
	current = { key, browser };
	if (previous) {
		frames.clear();
		urls.clear();
		threads.clear();
		for (const stream of streams.values()) void stream.stop().catch(() => {});
		streams.clear();
		void previous
			.close()
			.catch((error) => console.warn("Could not close the previous browser:", error));
	}
	return browser;
}

function needsApproval(tool: string, input: unknown, settings: AgentSettings): boolean {
	const s = settings.browser;
	if (tool === STAGEHAND_TOOLS.ACT) return s.approve_act;
	if (tool === STAGEHAND_TOOLS.NAVIGATE) return s.approve_navigate;
	if (tool === STAGEHAND_TOOLS.TABS)
		return s.approve_navigate && !!(input as { url?: string })?.url;
	return false;
}

/** Stagehand's tools for the agent, asking first where the settings say so. */
export function browserTools(
	settings: AgentSettings,
	connection: LlmConnection,
): ReturnType<typeof createStagehandTools> | Record<string, never> {
	if (!settings.browser.enabled) return {};
	const tools = createStagehandTools(browserFor(settings, connection));
	for (const [name, tool] of Object.entries(tools)) {
		const run = tool.execute;
		if (!run) continue;
		tool.execute = async (input, context) => {
			const reporter = contextValue(context, "reporter");
			const sessionId = contextValue(context, "sessionId");
			const threadId = contextValue(context, "threadId");
			const toolCallId = toolCallIdOf(context);
			if (reporter && toolCallId && needsApproval(name, input, settings)) {
				if (!(await reporter.approve(toolCallId, name, input))) return DECLINED.browser;
			}
			try {
				return await run(input, context);
			} finally {
				if (sessionId && threadId) {
					threads.set(sessionId, threadId);
					void watch(sessionId);
				}
			}
		};
	}
	return tools;
}

interface Frame {
	data: Buffer;
	width: number;
	height: number;
	at: number;
}

const frames = new Map<string, Frame>();
const urls = new Map<string, string>();
const streams = new Map<string, ScreencastStream>();
// Stagehand keeps a browser per memory thread, while the app asks by conversation.
const threads = new Map<string, string>();

/** Keep the latest frame of the conversation's page while its browser is open. */
async function watch(sessionId: string): Promise<void> {
	const browser = current?.browser;
	const threadId = threads.get(sessionId);
	if (!browser || !threadId || streams.get(sessionId)?.isActive()) return;
	const stream = await browser
		.startScreencastIfBrowserActive({
			threadId,
			format: "jpeg",
			quality: 70,
			maxWidth: VIEWPORT.width,
			maxHeight: VIEWPORT.height,
		})
		.catch(() => null);
	if (!stream) return;
	streams.set(sessionId, stream);
	stream.on("frame", (frame) => {
		frames.set(sessionId, {
			data: Buffer.from(frame.data, "base64"),
			width: frame.viewport.width,
			height: frame.viewport.height,
			at: Date.now() / 1000,
		});
	});
	stream.on("url", (url) => urls.set(sessionId, url));
	stream.on("stop", () => {
		if (streams.get(sessionId) === stream) streams.delete(sessionId);
	});
}

/** The conversation's browser for the screen: whether it is open, its page and last frame time. */
export async function browserView(sessionId: string): Promise<BrowserView> {
	const browser = current?.browser;
	await watch(sessionId);
	const frame = frames.get(sessionId);
	const threadId = threads.get(sessionId);
	const url =
		(threadId && (await browser?.getCurrentUrl(threadId).catch(() => null))) ||
		urls.get(sessionId) ||
		null;
	return {
		active: !!streams.get(sessionId)?.isActive(),
		url,
		frame_at: frame?.at ?? null,
		width: frame?.width ?? VIEWPORT.width,
		height: frame?.height ?? VIEWPORT.height,
	};
}

/** How many conversations have their browser open. */
export const openBrowsers = () => [...streams.values()].filter((s) => s.isActive()).length;

export const browserFrame = (sessionId: string) => frames.get(sessionId)?.data ?? null;

const KEY_CODES = { Enter: 13, Backspace: 8, Tab: 9, Escape: 27 } as const;

/** The user's own click, scroll or typing on the page (taking over from the agent). */
export async function browserInput(sessionId: string, input: BrowserInput): Promise<boolean> {
	const browser = current?.browser;
	const threadId = threads.get(sessionId);
	if (!browser || !threadId || !streams.get(sessionId)?.isActive()) return false;
	if (input.type === "click") {
		const at = { x: input.x, y: input.y, button: "left" as const, clickCount: 1 };
		for (const type of ["mousePressed", "mouseReleased"] as const) {
			await browser.injectMouseEvent({ type, ...at } satisfies MouseEventParams, threadId);
		}
	} else if (input.type === "scroll") {
		await browser.injectMouseEvent(
			{ type: "mouseWheel", x: input.x, y: input.y, deltaX: 0, deltaY: input.delta_y },
			threadId,
		);
	} else if (input.type === "text") {
		for (const char of input.text) {
			await browser.injectKeyboardEvent({ type: "char", text: char }, threadId);
		}
	} else {
		const code = KEY_CODES[input.key];
		const key = { key: input.key, code: input.key, windowsVirtualKeyCode: code };
		await browser.injectKeyboardEvent(
			{ type: "keyDown", ...key, ...(input.key === "Enter" ? { text: "\r" } : {}) },
			threadId,
		);
		await browser.injectKeyboardEvent({ type: "keyUp", ...key }, threadId);
	}
	return true;
}

/** Close the conversation's browser (also when the conversation is deleted). */
export async function closeBrowser(sessionId: string): Promise<void> {
	const stream = streams.get(sessionId);
	const threadId = threads.get(sessionId);
	streams.delete(sessionId);
	threads.delete(sessionId);
	frames.delete(sessionId);
	urls.delete(sessionId);
	await stream?.stop().catch(() => {});
	if (threadId) await current?.browser.closeThreadSession(threadId).catch(() => {});
}
