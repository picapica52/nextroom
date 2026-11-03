// What the character agent may do, under `agent` in the settings (settings/file.ts): the
// tools it can reach for (a browser through Stagehand, files and commands in its workspace, and
// apps such as Gmail through Composio). Tools are off until turned on here, since some need more
// setup (Chrome, Docker, a key).

import {
	type AgentSettings,
	type AgentSettingsPatch,
	type AgentSettingsView,
	type ApprovalRule,
	agentSettingsSchema,
} from "@nextroom/contracts";

import { parseOrBadRequest } from "../lib/errors";
import { composioApiKey, exaApiKey } from "./chat";
import { readSettingsSection, writeSettingsSection } from "./file";

export type { AgentSettings };

const AGENT_DEFAULTS: AgentSettings = {
	approvals: { mode: "auto", rules: [] },
	browser: { enabled: false, headless: false },
	desktop: { enabled: false, memory_mb: 4096, cpus: 2 },
	sandbox: {
		enabled: false,
		provider: "docker",
		image: "python:3.12-slim",
		memory_mb: 2048,
		cpus: 2,
		network: true,
		timeout_sec: 300,
	},
	web_search: { enabled: false },
	topic_search: { enabled: false },
	ask_user: { enabled: false },
	composio: {
		enabled: false,
		toolkits: ["gmail", "googlecalendar"],
	},
	routines: { enabled: true },
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

/** Settings for the UI, with whether the Exa and Composio keys are set (in the chat settings). */
export function getAgentSettings(): AgentSettingsView {
	const current = loadAgentSettings();
	return {
		...current,
		web_search: { ...current.web_search, has_api_key: Boolean(exaApiKey()) },
		topic_search: { ...current.topic_search, has_api_key: Boolean(exaApiKey()) },
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

/** Adds an approval rule, replacing the one the action had. */
export function addApprovalRule(rule: ApprovalRule): void {
	const current = loadAgentSettings();
	const rules = [...current.approvals.rules.filter((r) => r.tool !== rule.tool), rule];
	updateAgentSettings({ approvals: { rules } });
}
