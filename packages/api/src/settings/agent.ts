// What the character agent may do, under `agent` in _data/settings.json: the
// tools it can reach for (a browser through Stagehand, a sandbox through a Mastra workspace,
// Claude Agent SDK for longer tasks, and apps such as Gmail through Composio). Tools are off
// until turned on here, since each one needs the LLM to support tool calling and some need more
// setup (Chrome, Docker, a key).

import {
	type AgentSettings,
	type AgentSettingsPatch,
	type AgentSettingsView,
	agentSettingsSchema,
} from "@nextroom/contracts";

import { parseOrBadRequest } from "../lib/errors";
import { anthropicApiKey, composioApiKey, exaApiKey, loadSettings, openrouterApiKey } from "./chat";
import { readSettingsSection, writeSettingsSection } from "./file";

export type { AgentSettings };

const AGENT_DEFAULTS: AgentSettings = {
	browser: { enabled: false, headless: false, approve_act: true, approve_navigate: false },
	sandbox: {
		enabled: false,
		provider: "docker",
		image: "python:3.12-slim",
		memory_mb: 2048,
		cpus: 2,
		network: true,
		timeout_sec: 300,
		approve_command: true,
		approve_write: false,
		approve_delete: true,
	},
	claude: {
		enabled: false,
		auth: "api_key",
		model: "",
		permission_mode: "default",
		max_turns: 30,
		allowed_tools: ["Read", "Glob", "Grep", "TodoWrite"],
	},
	web_search: { enabled: false },
	topic_search: { enabled: false },
	ask_user: { enabled: false },
	image_gen: { enabled: false, approve: false },
	composio: {
		enabled: false,
		toolkits: ["gmail", "googlecalendar"],
		approve_read: false,
		approve_write: true,
	},
};

const SECTIONS = Object.keys(AGENT_DEFAULTS) as (keyof AgentSettings)[];

/** Each section of `base` with the fields of `patch` laid over it. */
function mergeSections(base: AgentSettings, patch: AgentSettingsPatch): AgentSettings {
	const merged: Record<string, unknown> = {};
	for (const key of SECTIONS) merged[key] = { ...base[key], ...patch[key] };
	return merged as AgentSettings;
}

export const loadAgentSettings = (): AgentSettings =>
	mergeSections(AGENT_DEFAULTS, readSettingsSection("agent") ?? {});

/** Settings for the UI, with whether the Anthropic, Exa, OpenRouter and Composio keys are set and
 *  the image model (all of them in the chat settings). */
export function getAgentSettings(): AgentSettingsView {
	const current = loadAgentSettings();
	return {
		...current,
		claude: { ...current.claude, has_api_key: Boolean(anthropicApiKey()) },
		web_search: { ...current.web_search, has_api_key: Boolean(exaApiKey()) },
		topic_search: { ...current.topic_search, has_api_key: Boolean(exaApiKey()) },
		image_gen: {
			...current.image_gen,
			has_api_key: Boolean(openrouterApiKey()),
			model: loadSettings().image_gen_model,
		},
		composio: { ...current.composio, has_api_key: Boolean(composioApiKey()) },
	};
}

/** Changes the given fields. */
export function updateAgentSettings(patch: AgentSettingsPatch) {
	const settings = parseOrBadRequest(
		agentSettingsSchema,
		mergeSections(loadAgentSettings(), patch),
	);
	writeSettingsSection("agent", settings);
	return getAgentSettings();
}
