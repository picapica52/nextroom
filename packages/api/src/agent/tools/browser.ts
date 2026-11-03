// The browser: Chrome on this PC driven by Stagehand, one browser per conversation. The agent gets
// the stagehand_* tools (navigate / act / extract / observe / tabs / screenshot / close); act and
// navigate can be set to ask first. Stagehand reads pages with the conversation's own LLM
// (stagehand-llm.ts).
//
// While a conversation's browser is open, its page streams as JPEG frames (Chrome's
// screencast) that the app shows, and the user can take over by clicking and typing into it.

import { type JsonSchema, jsonSchemaToZod, type Page, Stagehand } from "@browserbasehq/stagehand";
import type { BrowserInput, BrowserView } from "@nextroom/contracts";
import { z } from "zod";
import { messageOf } from "../../lib/errors";
import type { AgentSettings } from "../../settings/agent";
import { complete, replyText } from "../llm";
import { type LlmConnection, modelOf } from "../providers";
import { defineTool, type ToolCall, type ToolSet } from "../tool";
import { StagehandLlm } from "./stagehand-llm";

const VIEWPORT = { width: 1280, height: 720 };
const SCREENCAST = {
	format: "jpeg",
	quality: 70,
	maxWidth: VIEWPORT.width,
	maxHeight: VIEWPORT.height,
};
/** After a navigation, Chrome may stop the screencast of the new document. */
const RESTART_MS = 300;

type Cdp = ReturnType<Page["getSessionForFrame"]>;

interface Frame {
	data: Buffer;
	width: number;
	height: number;
	at: number;
}

interface Screencast {
	page: Page;
	stop: () => Promise<void>;
}

interface Browser {
	/** The settings and connection it was opened with. */
	key: string;
	llm: StagehandLlm;
	launched: Promise<Stagehand>;
	/** Set once Chrome is up. */
	stagehand: Stagehand | null;
	screencast: Screencast | null;
	/** Screencast changes, one at a time. */
	watching: Promise<void>;
	frame: Frame | null;
	url: string | null;
}

/** The open browsers, by conversation. */
const browsers = new Map<string, Browser>();

function forget(sessionId: string, browser: Browser): void {
	if (browsers.get(sessionId) !== browser) return;
	browsers.delete(sessionId);
	void browser.screencast?.stop();
	browser.screencast = null;
}

/** The conversation's browser, launched (again, when the settings or the LLM changed) if needed. */
async function open(
	sessionId: string,
	settings: AgentSettings,
	connection: LlmConnection,
): Promise<Browser & { stagehand: Stagehand }> {
	const key = JSON.stringify([settings.browser.headless, connection]);
	const existing = browsers.get(sessionId);
	if (existing && existing.key !== key) await closeBrowser(sessionId);
	let browser = browsers.get(sessionId);
	if (!browser) {
		const llm = new StagehandLlm(connection);
		const stagehand = new Stagehand({
			env: "LOCAL",
			llmClient: llm,
			localBrowserLaunchOptions: { headless: settings.browser.headless, viewport: VIEWPORT },
			selfHeal: true,
			verbose: 0,
			disablePino: true,
			logger: () => {},
		});
		const created: Browser = {
			key,
			llm,
			launched: stagehand.init().then(() => stagehand),
			stagehand: null,
			screencast: null,
			watching: Promise.resolve(),
			frame: null,
			url: null,
		};
		browser = created;
		browsers.set(sessionId, created);
		created.launched
			.then((ready) => {
				created.stagehand = ready;
				ready.context.conn.onTransportClosed(() => forget(sessionId, created));
			})
			.catch(() => forget(sessionId, created));
	}
	const stagehand = await browser.launched.catch((error) => {
		throw new Error(`Could not start Chrome: ${messageOf(error)}`);
	});
	return Object.assign(browser, { stagehand });
}

/** The tab the agent works in, opening one if the user closed them all. */
async function pageOf(stagehand: Stagehand): Promise<Page> {
	return stagehand.context.activePage() ?? (await stagehand.context.newPage());
}

interface ScreencastFrame {
	data: string;
	sessionId: number;
	metadata: { deviceWidth: number; deviceHeight: number };
}

interface FrameNavigated {
	frame: { parentId?: string; url: string };
}

function startScreencast(browser: Browser, page: Page): Promise<void> {
	const cdp: Cdp = page.getSessionForFrame(page.mainFrameId());
	let restart: ReturnType<typeof setTimeout> | undefined;
	const onFrame = (frame: ScreencastFrame) => {
		browser.frame = {
			data: Buffer.from(frame.data, "base64"),
			width: frame.metadata.deviceWidth,
			height: frame.metadata.deviceHeight,
			at: Date.now() / 1000,
		};
		void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
	};
	const onNavigated = ({ frame }: FrameNavigated) => {
		if (frame.parentId) return;
		browser.url = frame.url;
		clearTimeout(restart);
		restart = setTimeout(async () => {
			await cdp.send("Page.stopScreencast").catch(() => {});
			await cdp.send("Page.startScreencast", SCREENCAST).catch(() => {});
		}, RESTART_MS);
	};
	cdp.on("Page.screencastFrame", onFrame);
	cdp.on("Page.frameNavigated", onNavigated);
	const screencast: Screencast = {
		page,
		stop: async () => {
			clearTimeout(restart);
			cdp.off("Page.screencastFrame", onFrame);
			cdp.off("Page.frameNavigated", onNavigated);
			await cdp.send("Page.stopScreencast").catch(() => {});
		},
	};
	browser.screencast = screencast;
	browser.url = page.url() || browser.url;
	return cdp
		.send("Page.enable")
		.then(() => cdp.send("Page.startScreencast", SCREENCAST))
		.then(
			() => {},
			async () => {
				if (browser.screencast === screencast) browser.screencast = null;
				await screencast.stop();
			},
		);
}

/** Stream the tab the conversation's browser is on, following it when the tab changes. */
function watch(sessionId: string): Promise<void> {
	const browser = browsers.get(sessionId);
	if (!browser) return Promise.resolve();
	browser.watching = browser.watching.then(async () => {
		if (browsers.get(sessionId) !== browser) return;
		const page = browser.stagehand?.context.activePage();
		if (browser.screencast?.page === page) return;
		const previous = browser.screencast;
		browser.screencast = null;
		await previous?.stop();
		if (page) await startScreencast(browser, page);
	});
	return browser.watching;
}

/** What a tool answers when the browser could not do it, as Stagehand's errors read. */
function failure(action: string, error: unknown) {
	const message = messageOf(error);
	if (message.includes("No actions found") || message.includes("Could not find"))
		return {
			success: false,
			message: `${action}: Could not find a matching element or action.`,
			hint: "Try rephrasing the instruction or use stagehand_observe to see available actions.",
		};
	if (/timeout|timed out/i.test(message))
		return {
			success: false,
			message: `${action} timed out.`,
			hint: "Try again or increase timeout.",
		};
	return {
		success: false,
		message: `${action} failed: ${message}`,
		hint: "Check the browser state and try again.",
	};
}

const SCREENSHOT_INSTRUCTIONS =
	"You see a screenshot of a web page. Describe what it shows for someone who cannot see it: the layout, the text that stands out, images, photos, colors and anything unusual. Be concrete and brief.";

/** A screenshot in words, since the tool answers the character with text. */
async function describe(png: Buffer, connection: LlmConnection, signal: AbortSignal) {
	const reply = await complete(
		connection,
		SCREENSHOT_INSTRUCTIONS,
		[
			{
				role: "user",
				content: [{ type: "image", mimeType: "image/png", data: png.toString("base64") }],
				timestamp: Date.now(),
			},
		],
		{ temperature: 0.2, signal },
	);
	return replyText(reply);
}

const actSchema = z.object({
	instruction: z
		.string()
		.describe('Natural language instruction for the action (e.g., "click the login button")'),
	variables: z
		.record(z.string(), z.string())
		.optional()
		.describe("Variables to substitute in the instruction using %variableName% syntax"),
	useVision: z.boolean().optional().describe("Whether to use vision capabilities (default: true)"),
	timeout: z.number().optional().describe("Timeout in milliseconds"),
});

const extractSchema = z.object({
	instruction: z.string().describe("Natural language instruction for what data to extract"),
	schema: z
		.record(z.string(), z.unknown())
		.optional()
		.describe(
			"JSON schema defining the expected data structure (optional, will return unstructured if omitted)",
		),
	timeout: z.number().optional().describe("Timeout in milliseconds"),
});

const observeSchema = z.object({
	instruction: z
		.string()
		.optional()
		.describe(
			'Natural language instruction for what to find (e.g., "find all buttons"). If omitted, finds all interactive elements.',
		),
	onlyVisible: z.boolean().optional().describe("Only return visible elements (default: true)"),
	timeout: z.number().optional().describe("Timeout in milliseconds"),
});

const navigateSchema = z.object({
	url: z.string().describe("The URL to navigate to"),
	waitUntil: z
		.enum(["load", "domcontentloaded", "networkidle"])
		.optional()
		.describe("When to consider navigation complete (default: domcontentloaded)"),
});

const tabsSchema = z
	.object({
		action: z
			.enum(["list", "new", "switch", "close"])
			.describe("Action to perform: list all tabs, open new tab, switch to tab, or close tab"),
		index: z
			.number()
			.int()
			.min(0)
			.optional()
			.describe(
				"Tab index for switch/close actions (0-based). Required for switch, optional for close (defaults to current).",
			),
		url: z
			.string()
			.optional()
			.describe('URL to navigate to after opening new tab (optional, for "new" action only)'),
	})
	.superRefine((value, ctx) => {
		if (value.action === "switch" && value.index === undefined)
			ctx.addIssue({
				code: "custom",
				path: ["index"],
				message: 'index is required when action is "switch"',
			});
	});

const screenshotSchema = z.object({
	fullPage: z
		.boolean()
		.optional()
		.describe("Capture the full scrollable page instead of just the viewport (default: false)"),
});

type Tabs = z.infer<typeof tabsSchema>;

async function tabs(stagehand: Stagehand, input: Tabs) {
	const context = stagehand.context;
	const pages = context.pages();
	const listHint = 'Use stagehand_tabs with action:"list" to see available tabs.';
	switch (input.action) {
		case "list": {
			const active = context.activePage();
			return {
				success: true,
				tabs: await Promise.all(
					pages.map(async (page, index) => ({
						index,
						url: page.url(),
						title: await page.title(),
						active: page === active,
					})),
				),
				hint: 'Use stagehand_tabs with action:"switch" and index to change tabs.',
			};
		}
		case "new": {
			const page = await context.newPage(input.url);
			return {
				success: true,
				index: context.pages().length - 1,
				url: page.url(),
				title: await page.title(),
				hint: "New tab opened. Use stagehand_observe to discover actions.",
			};
		}
		case "switch": {
			const page = input.index === undefined ? undefined : pages[input.index];
			if (!page)
				return {
					success: false,
					message: `Invalid tab index: ${input.index}. Valid range: 0-${pages.length - 1}`,
					hint: listHint,
				};
			context.setActivePage(page);
			return {
				success: true,
				index: input.index,
				url: page.url(),
				title: await page.title(),
				hint: "Tab switched. Use stagehand_observe to discover actions.",
			};
		}
		case "close": {
			const active = context.activePage();
			const index = input.index ?? (active ? pages.indexOf(active) : -1);
			const page = pages[index];
			if (!page) return { success: false, message: `Invalid tab index: ${index}`, hint: listHint };
			await page.close();
			const remaining = context.pages().length;
			return {
				success: true,
				remaining,
				hint:
					remaining > 0
						? "Tab closed. Use stagehand_observe to see current tab."
						: "All tabs closed.",
			};
		}
	}
}

/** Stagehand's tools for the agent, asking first where the settings say so. */
export function browserTools(settings: AgentSettings, connection: LlmConnection): ToolSet {
	if (!settings.browser.enabled) return {};

	const browserTool = <S extends z.ZodType>(tool: {
		name: string;
		description: string;
		schema: S;
		changes?: (input: z.infer<S>) => boolean;
		run: (input: z.infer<S>, stagehand: Stagehand, call: ToolCall) => Promise<unknown>;
		action: string;
	}) =>
		defineTool({
			name: tool.name,
			description: tool.description,
			schema: tool.schema,
			sequential: true,
			changes: tool.changes as ((input: unknown) => boolean) | undefined,
			async execute(input, call) {
				const { sessionId } = call.context;
				const browser = await open(sessionId, settings, connection);
				browser.llm.signal = call.signal;
				try {
					return await tool.run(input, browser.stagehand, call);
				} catch (error) {
					if (call.signal.aborted) throw error;
					return failure(tool.action, error);
				} finally {
					browser.llm.signal = undefined;
					await watch(sessionId);
				}
			},
		});

	return {
		stagehand_act: browserTool({
			name: "stagehand_act",
			description:
				'Perform an action on the page using natural language. Examples: "click the login button", "type hello into the search box", "scroll down".',
			schema: actSchema,
			action: "Act",
			changes: () => true,
			run: async (input, stagehand) => {
				const page = await pageOf(stagehand);
				const result = await stagehand.act(input.instruction, {
					variables: input.variables,
					timeout: input.timeout,
					page,
				});
				return {
					success: result.success,
					message: result.message,
					action: result.actionDescription,
					url: page.url(),
					hint: "Use observe() to discover available actions or extract() to get page data.",
				};
			},
		}),
		stagehand_extract: browserTool({
			name: "stagehand_extract",
			description:
				"Extract structured data from the page using natural language. Can optionally provide a JSON schema for the expected data structure.",
			schema: extractSchema,
			action: "Extract",
			run: async (input, stagehand) => {
				const page = await pageOf(stagehand);
				const options = { page, timeout: input.timeout };
				const schema = input.schema && jsonSchemaToZod(input.schema as unknown as JsonSchema);
				return {
					success: true,
					data: schema
						? await stagehand.extract(input.instruction, schema, options)
						: await stagehand.extract(input.instruction, options),
					url: page.url(),
					hint: "Data extracted successfully. Use act() to perform actions based on this data.",
				};
			},
		}),
		stagehand_observe: browserTool({
			name: "stagehand_observe",
			description:
				"Discover actionable elements on the page. Returns a list of actions that can be performed. Use this to understand what's on the page before acting.",
			schema: observeSchema,
			action: "Observe",
			run: async (input, stagehand) => {
				const page = await pageOf(stagehand);
				const options = { page, timeout: input.timeout };
				const actions = input.instruction
					? await stagehand.observe(input.instruction, options)
					: await stagehand.observe(options);
				return {
					success: true,
					actions: actions.map((a) => ({
						selector: a.selector,
						description: a.description,
						method: a.method,
						arguments: a.arguments,
					})),
					url: page.url(),
					hint:
						actions.length > 0
							? `Found ${actions.length} actions. Use act() with a specific instruction to execute one.`
							: "No actions found. Try a different instruction or navigate to a different page.",
				};
			},
		}),
		stagehand_navigate: browserTool({
			name: "stagehand_navigate",
			description: "Navigate the browser to a URL.",
			schema: navigateSchema,
			action: "Navigate",
			run: async (input, stagehand) => {
				const page = await pageOf(stagehand);
				await page.goto(input.url, { waitUntil: input.waitUntil ?? "domcontentloaded" });
				return {
					success: true,
					url: page.url(),
					title: await page.title(),
					hint: "Page loaded. Use observe() to discover actions or extract() to get data.",
				};
			},
		}),
		stagehand_tabs: browserTool({
			name: "stagehand_tabs",
			description:
				'Manage browser tabs. Actions: "list" shows all tabs, "new" opens a tab (optionally with URL), "switch" changes to tab by index, "close" closes a tab.',
			schema: tabsSchema,
			action: "Tabs",
			run: (input, stagehand) => tabs(stagehand, input),
		}),
		stagehand_screenshot: browserTool({
			name: "stagehand_screenshot",
			description:
				"Capture a screenshot of the current viewport (set fullPage: true for full-page capture) and get a description of what it shows. Use observe or extract when you only need text or interactive elements — screenshots are expensive. Use this when you need to visually inspect the page, e.g. evaluating images, product photos, layout, design, or colors.",
			schema: screenshotSchema,
			action: "Screenshot",
			run: async (input, stagehand, call) => {
				const page = await pageOf(stagehand);
				if (!modelOf(connection).input.includes("image"))
					return {
						success: false,
						message: `The model ${connection.model} cannot see images.`,
						hint: "Use stagehand_extract or stagehand_observe instead.",
					};
				const png = await page.screenshot({ fullPage: input.fullPage ?? false, type: "png" });
				return {
					success: true,
					url: page.url(),
					title: await page.title(),
					description: await describe(png, connection, call.signal),
				};
			},
		}),
		stagehand_close: defineTool({
			name: "stagehand_close",
			description: "Close the browser. Only use when done with all browsing.",
			schema: z.object({}),
			sequential: true,
			async execute(_input, call) {
				await closeBrowser(call.context.sessionId);
				return {
					success: true,
					hint: "Browser closed. A new one will be launched on next use.",
				};
			},
		}),
	};
}

/** The conversation's browser for the screen: whether it is open, its page and last frame time. */
export async function browserView(sessionId: string): Promise<BrowserView> {
	await watch(sessionId);
	const browser = browsers.get(sessionId);
	const page = browser?.stagehand?.context.activePage();
	const frame = browser?.frame;
	return {
		active: !!browser?.screencast,
		url: page?.url() || browser?.url || null,
		frame_at: frame?.at ?? null,
		width: frame?.width ?? VIEWPORT.width,
		height: frame?.height ?? VIEWPORT.height,
	};
}

/** How many conversations have their browser open. */
export const openBrowsers = () => [...browsers.values()].filter((b) => b.stagehand).length;

export const browserFrame = (sessionId: string) => browsers.get(sessionId)?.frame?.data ?? null;

const KEY_CODES = { Enter: 13, Backspace: 8, Tab: 9, Escape: 27 } as const;

/** The user's own click, scroll or typing on the page (taking over from the agent). */
export async function browserInput(sessionId: string, input: BrowserInput): Promise<boolean> {
	const page = browsers.get(sessionId)?.screencast?.page;
	if (!page) return false;
	const cdp = page.getSessionForFrame(page.mainFrameId());
	if (input.type === "click") {
		for (const type of ["mousePressed", "mouseReleased"])
			await cdp.send("Input.dispatchMouseEvent", {
				type,
				x: input.x,
				y: input.y,
				button: "left",
				buttons: 1,
				clickCount: 1,
			});
	} else if (input.type === "scroll") {
		await cdp.send("Input.dispatchMouseEvent", {
			type: "mouseWheel",
			x: input.x,
			y: input.y,
			button: "none",
			deltaX: 0,
			deltaY: input.delta_y,
		});
	} else if (input.type === "text") {
		for (const char of input.text)
			await cdp.send("Input.dispatchKeyEvent", { type: "char", text: char });
	} else {
		const key = {
			key: input.key,
			code: input.key,
			windowsVirtualKeyCode: KEY_CODES[input.key],
		};
		await cdp.send("Input.dispatchKeyEvent", {
			type: "keyDown",
			...key,
			...(input.key === "Enter" ? { text: "\r" } : {}),
		});
		await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
	}
	return true;
}

/** Close the conversation's browser (also when the conversation is deleted). */
export async function closeBrowser(sessionId: string): Promise<void> {
	const browser = browsers.get(sessionId);
	if (!browser) return;
	forget(sessionId, browser);
	const stagehand = await browser.launched.catch(() => null);
	await stagehand?.close().catch(() => {});
}
