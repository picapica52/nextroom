// The character agent: its settings (tools), the steps of a reply, and what the
// browser, sandbox and memory screens are answered with.

import { z } from "zod";

/** The groups of tools a character can be kept from using (in its own settings). Its memory tool
 *  is always at hand. */
export const TOOL_GROUPS = [
	"web_search",
	"topic_search",
	"browser",
	"desktop",
	"workspace",
	"ask_user",
	"apps",
	"routines",
] as const;
export type ToolGroup = (typeof TOOL_GROUPS)[number];

/** How much a character may do without asking: never ask, let the approval model decide (it asks
 *  when an action is off the request or cannot be undone), or ask before any action that changes
 *  something. */
export const APPROVAL_MODES = ["never", "auto", "ask"] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

/** An action always allowed (it never asks) or blocked (refused without asking), in every mode.
 *  `tool` is the tool's name, or the app action for an app's tools. */
export const approvalRuleSchema = z.object({
	tool: z.string().trim().min(1),
	decision: z.enum(["allow", "block"]),
});
export type ApprovalRule = z.infer<typeof approvalRuleSchema>;

/** The agent settings as stored; the server checks every change against it. */
export const agentSettingsSchema = z.object({
	approvals: z.object({
		mode: z.enum(APPROVAL_MODES),
		rules: z.array(approvalRuleSchema),
	}),
	browser: z.object({
		enabled: z.boolean(),
		/** Hide Chrome's window; the page also streams to the app either way. */
		headless: z.boolean(),
	}),
	desktop: z.object({
		/** A Linux desktop of its own per character (a Docker container), which the user can watch
		 *  and take over. Only for models that can see images. */
		enabled: z.boolean(),
		memory_mb: z.number().int().min(512).max(65536),
		cpus: z.number().min(0.5).max(64),
	}),
	sandbox: z.object({
		enabled: z.boolean(),
		/** docker: a container per workspace; local: commands run on this PC unisolated. */
		provider: z.enum(["docker", "local"]),
		image: z.string().trim().min(1),
		memory_mb: z.number().int().min(128).max(65536),
		cpus: z.number().min(0.25).max(64),
		network: z.boolean(),
		timeout_sec: z.number().int().min(5).max(3600),
	}),
	web_search: z.object({
		/** Search the web through Exa's API (its key is in the integrations' settings). */
		enabled: z.boolean(),
	}),
	topic_search: z.object({
		/** Find topics to talk about when the user asks the character to say something (Exa). */
		enabled: z.boolean(),
	}),
	ask_user: z.object({
		/** A reply that needs the user to decide something ends with choices (ask_user). */
		enabled: z.boolean(),
	}),
	composio: z.object({
		/** Apps such as Gmail or Google Calendar through Composio; accounts are connected from the
		 *  integrations' settings. */
		enabled: z.boolean(),
		/** Composio's toolkit slugs the character may use, e.g. gmail, googlecalendar. */
		toolkits: z.array(z.string().trim().toLowerCase().min(1)),
	}),
	routines: z.object({
		/** The character can set up, list and cancel routines in the conversation. */
		enabled: z.boolean(),
	}),
});

export type AgentSettings = z.infer<typeof agentSettingsSchema>;

const { shape } = agentSettingsSchema;

/** A change to the settings: any fields of any section. */
export const agentSettingsPatchSchema = z.object({
	approvals: shape.approvals.partial().optional(),
	browser: shape.browser.partial().optional(),
	desktop: shape.desktop.partial().optional(),
	sandbox: shape.sandbox.partial().optional(),
	web_search: shape.web_search.partial().optional(),
	topic_search: shape.topic_search.partial().optional(),
	ask_user: shape.ask_user.partial().optional(),
	composio: shape.composio.partial().optional(),
	routines: shape.routines.partial().optional(),
});
export type AgentSettingsPatch = z.infer<typeof agentSettingsPatchSchema>;

/** The settings as the API answers them, with whether the Exa and Composio keys are set. */
export type AgentSettingsView = Omit<AgentSettings, "web_search" | "topic_search" | "composio"> & {
	web_search: AgentSettings["web_search"] & { has_api_key: boolean };
	topic_search: AgentSettings["topic_search"] & { has_api_key: boolean };
	composio: AgentSettings["composio"] & { has_api_key: boolean };
};

/** One of the Composio toolkits the settings name, and whether an account is connected to it. */
export interface ComposioToolkit {
	slug: string;
	name: string;
	logo: string | null;
	/** Needs no account (connected is then true). */
	no_auth: boolean;
	connected: boolean;
}

export interface ComposioStatus {
	toolkits: ComposioToolkit[];
	/** Why the toolkits could not be read (no key, Composio did not answer…). */
	error: string | null;
}

/** Where Composio's sign-in page sends the user back to once the account is connected. */
export const composioConnectSchema = z.object({ callback_url: z.url() });

const STEP_KINDS = [
	"browser",
	"desktop",
	"sandbox",
	"claude",
	/** Older replies: the photo tool, since removed. */
	"image",
	"ask",
	"memory",
	"app",
	"other",
] as const;
const STEP_STATUSES = ["running", "awaiting", "done", "error", "declined"] as const;
export type StepKind = (typeof STEP_KINDS)[number];

/** One tool call of a reply. */
export const agentStepSchema = z.object({
	/** The tool call's id. */
	id: z.string(),
	tool: z.string(),
	kind: z.enum(STEP_KINDS),
	status: z.enum(STEP_STATUSES),
	/** What the call was asked to do, shortened. */
	input: z.string(),
	/** The call's whole input, as sent (clipped to 10,000 characters); empty without input. */
	detail: z.string(),
	/** Its result, or the command's output so far (the tail of it). */
	output: z.string(),
	/** For a tool call made within another one (Claude Agent SDK's, in older replies): the step it
	 *  was made under. */
	parent: z.string().optional(),
	/** While `awaiting`: the id to answer with. */
	approval: z.string().optional(),
	/** For ask_user: the choices the reply ends with; the one picked is the user's next message. */
	question: z
		.object({
			text: z.string(),
			options: z.array(z.object({ label: z.string(), description: z.string().optional() })),
			/** Any number of the options may be chosen. */
			multi: z.boolean(),
		})
		.optional(),
	started_at: z.number(),
	finished_at: z.number().optional(),
});
export type AgentStep = z.infer<typeof agentStepSchema>;

/** The user's answer to a step waiting for the go-ahead. */
export const approvalSchema = z.object({
	approved: z.boolean(),
	/** Always allow this tool from now on (it is added to the approval rules). */
	always: z.boolean().default(false),
});

/** The user's own input into a conversation's browser (taking over from the agent). */
export const browserInputSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("click"), x: z.number(), y: z.number() }),
	z.object({ type: z.literal("scroll"), x: z.number(), y: z.number(), delta_y: z.number() }),
	z.object({ type: z.literal("text"), text: z.string().min(1).max(500) }),
	z.object({ type: z.literal("key"), key: z.enum(["Enter", "Backspace", "Tab", "Escape"]) }),
]);
export type BrowserInput = z.infer<typeof browserInputSchema>;

export interface BrowserView {
	active: boolean;
	url: string | null;
	frame_at: number | null;
	width: number;
	height: number;
}

/** A character's desktop: whether it is turned on, running or being made. */
export interface DesktopView {
	enabled: boolean;
	running: boolean;
	starting: boolean;
	error: string | null;
}

export interface DockerStatus {
	ok: boolean;
	version: string | null;
	/** Running containers of this app's workspaces (null when Docker does not answer). */
	containers: number | null;
	error: string | null;
}

/** What a character remembers: its notes (MEMORY.md), and the summary of the conversation
 *  older than what the character still has word for word. */
export interface MemoryOverview {
	resource_id: string;
	working_memory: string;
	summary: string;
}
