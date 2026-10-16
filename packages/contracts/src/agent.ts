// The character agent: its settings (tools), the steps of a reply, and what the
// browser, sandbox and memory screens are answered with.

import { z } from "zod";

export const CLAUDE_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"] as const;
export const PERMISSION_MODES = ["default", "acceptEdits", "plan", "dontAsk"] as const;
export const CLAUDE_TOOLS = [
	"Read",
	"Glob",
	"Grep",
	"Write",
	"Edit",
	"Bash",
	"TodoWrite",
	"WebSearch",
	"WebFetch",
] as const;

export type PermissionMode = (typeof PERMISSION_MODES)[number];

/** The agent settings as stored; the server checks every change against it. */
export const agentSettingsSchema = z.object({
	browser: z.object({
		enabled: z.boolean(),
		/** Hide Chrome's window; the page also streams to the app either way. */
		headless: z.boolean(),
		approve_act: z.boolean(),
		approve_navigate: z.boolean(),
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
		approve_command: z.boolean(),
		approve_write: z.boolean(),
		approve_delete: z.boolean(),
	}),
	claude: z.object({
		enabled: z.boolean(),
		/** api_key: the Anthropic key of the chat settings (or ANTHROPIC_API_KEY); login: this
		 *  PC's Claude Code login (a Claude subscription), for personal use only. */
		auth: z.enum(["api_key", "login"]),
		/** Empty: not chosen yet, and Claude cannot be handed work. */
		model: z.string().trim(),
		permission_mode: z.enum(PERMISSION_MODES),
		max_turns: z.number().int().min(1).max(200),
		/** Tools Claude may use without asking; the rest ask on the conversation screen. */
		allowed_tools: z.array(z.string()),
	}),
	web_search: z.object({
		/** Search the web through Exa's API (its key is in the connection settings). */
		enabled: z.boolean(),
	}),
	topic_search: z.object({
		/** Find topics to talk about when the user asks the character to say something (Exa). */
		enabled: z.boolean(),
	}),
	ask_user: z.object({
		/** A reply that needs the user to decide something ends with choices (Mastra's ask_user). */
		enabled: z.boolean(),
	}),
	image_gen: z.object({
		/** Draw images through OpenRouter's Images API, with the model of the chat settings'
		 *  `image_gen_model` (its key is in the connection settings). */
		enabled: z.boolean(),
		approve: z.boolean(),
	}),
	composio: z.object({
		/** Apps such as Gmail or Google Calendar through Composio (its key is in the connection
		 *  settings); accounts are connected from the agent settings. */
		enabled: z.boolean(),
		/** Composio's toolkit slugs the character may use, e.g. gmail, googlecalendar. */
		toolkits: z.array(z.string().trim().toLowerCase().min(1)),
		/** Ask before calls that only read (list, get, search…). */
		approve_read: z.boolean(),
		/** Ask before calls that send, create, change or delete. */
		approve_write: z.boolean(),
	}),
});

export type AgentSettings = z.infer<typeof agentSettingsSchema>;

const { shape } = agentSettingsSchema;

/** A change to the settings: any fields of any section. */
export const agentSettingsPatchSchema = z.object({
	browser: shape.browser.partial().optional(),
	sandbox: shape.sandbox.partial().optional(),
	claude: shape.claude.partial().optional(),
	web_search: shape.web_search.partial().optional(),
	topic_search: shape.topic_search.partial().optional(),
	ask_user: shape.ask_user.partial().optional(),
	image_gen: shape.image_gen.partial().optional(),
	composio: shape.composio.partial().optional(),
});
export type AgentSettingsPatch = z.infer<typeof agentSettingsPatchSchema>;

/** The settings as the API answers them, with whether the Anthropic, Exa, OpenRouter and Composio
 *  keys are set and the image model of the chat settings. */
export type AgentSettingsView = Omit<
	AgentSettings,
	"claude" | "web_search" | "topic_search" | "image_gen" | "composio"
> & {
	claude: AgentSettings["claude"] & { has_api_key: boolean };
	web_search: AgentSettings["web_search"] & { has_api_key: boolean };
	topic_search: AgentSettings["topic_search"] & { has_api_key: boolean };
	image_gen: AgentSettings["image_gen"] & { has_api_key: boolean; model: string };
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

/** The shapes the image tool can ask for. */
export const IMAGE_ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;

const STEP_KINDS = ["browser", "sandbox", "claude", "image", "ask", "app", "other"] as const;
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
	/** For Claude Agent SDK's own tool calls: the step that handed it the task. */
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
	/** Allow this tool for the rest of the conversation. */
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

export interface DockerStatus {
	ok: boolean;
	version: string | null;
	/** Running containers of this app's workspaces (null when Docker does not answer). */
	containers: number | null;
	error: string | null;
}

export interface MemoryOverview {
	resource_id: string;
	working_memory: string;
}
