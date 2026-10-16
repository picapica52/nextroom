// Handing a longer task to Claude Agent SDK: the character agent calls `delegate_to_claude`,
// which runs a ClaudeSDKAgent (@mastra/claude) in the conversation's workspace and
// returns Claude's summary. Claude's own tool calls show up as steps under the delegating
// one (through the SDK's PreToolUse / PostToolUse hooks), and those not in the allowed list
// ask on the conversation screen (through canUseTool).
//
// Claude Agent SDK runs Claude Code on this PC, not in the Docker container: the working
// workspace is the only boundary, so Bash should stay out of the allowed tools.

import type { CanUseTool, HookCallback, Options } from "@anthropic-ai/claude-agent-sdk";
import { ClaudeSDKAgent } from "@mastra/claude";
import type { ToolsInput } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AgentSettings } from "../../settings/agent";
import { anthropicApiKey } from "../../settings/chat";
import { workspaceDir } from "../../workspaces/store";
import { contextValue, toolCallIdOf } from "../context";
import {
	CLAUDE_INSTRUCTIONS,
	CLAUDE_SILENT,
	DECLINED,
	NO_ANTHROPIC_KEY,
	NO_CLAUDE_MODEL,
	OUTSIDE_CONVERSATION,
} from "../prompts";
import type { TurnReporter } from "../steps";

const DELEGATE_TOOL = "delegate_to_claude";

const ok = { continue: true } as const;

/** This app's environment for Claude Code. Variables of a Claude Code session this app may
 *  have been started from are left out: with them, Claude Code would act as that session's
 *  child. With an API key, Claude Code uses the key; for the login, any key is left out so
 *  that Claude Code falls back to this PC's Claude Code login. */
function claudeEnv(settings: AgentSettings): Record<string, string | undefined> {
	const login = settings.claude.auth === "login";
	const inherited = Object.entries(process.env).filter(
		([key]) =>
			key !== "CLAUDECODE" &&
			!key.startsWith("CLAUDE_CODE_") &&
			!(login && (key === "ANTHROPIC_API_KEY" || key === "ANTHROPIC_AUTH_TOKEN")),
	);
	return {
		...Object.fromEntries(inherited),
		...(login ? {} : { ANTHROPIC_API_KEY: anthropicApiKey() }),
		CLAUDE_AGENT_SDK_CLIENT_APP: "nextroom",
	};
}

function hooks(reporter: TurnReporter, parent: string): Options["hooks"] {
	const before: HookCallback = async (input) => {
		if (input.hook_event_name === "PreToolUse") {
			reporter.start(input.tool_use_id, `claude:${input.tool_name}`, input.tool_input, parent);
		}
		return ok;
	};
	const after: HookCallback = async (input) => {
		if (input.hook_event_name === "PostToolUse") {
			reporter.finish(input.tool_use_id, "done", input.tool_response);
		} else if (input.hook_event_name === "PostToolUseFailure") {
			reporter.finish(input.tool_use_id, "error", input.error);
		}
		return ok;
	};
	return {
		PreToolUse: [{ hooks: [before] }],
		PostToolUse: [{ hooks: [after] }],
		PostToolUseFailure: [{ hooks: [after] }],
	};
}

function askUser(reporter: TurnReporter, parent: string): CanUseTool {
	return async (toolName, input, { toolUseID }) => {
		if (await reporter.approve(toolUseID, `claude:${toolName}`, input, parent)) {
			return { behavior: "allow", updatedInput: input };
		}
		return { behavior: "deny", message: DECLINED.claude };
	};
}

/** The options Claude runs with for this conversation. */
function claudeOptions(
	settings: AgentSettings,
	characterId: string,
	reporter: TurnReporter,
	parent: string,
): Options {
	const s = settings.claude;
	return {
		model: s.model,
		cwd: workspaceDir(characterId),
		permissionMode: s.permission_mode,
		maxTurns: s.max_turns,
		allowedTools: s.allowed_tools,
		// The user's own Claude Code settings and CLAUDE.md stay out of it.
		settingSources: [],
		systemPrompt: { type: "preset", preset: "claude_code", append: CLAUDE_INSTRUCTIONS },
		env: claudeEnv(settings),
		canUseTool: askUser(reporter, parent),
		hooks: hooks(reporter, parent),
	};
}

const delegate = createTool({
	id: DELEGATE_TOOL,
	description:
		"Through your device, hand laborious, multi-step work that produces files in the workspace over to Claude, a helper on the user's side. " +
		"Claude works in your workspace and returns a summary of what it did when finished. " +
		"Do not use it for questions that take only a few seconds.",
	inputSchema: z.object({
		task: z
			.string()
			.describe(
				"What to do, specifically. If files should be created, include their names and formats.",
			),
	}),
	execute: async ({ task }, context) => {
		const settings = contextValue(context, "settings");
		const reporter = contextValue(context, "reporter");
		const characterId = contextValue(context, "characterId");
		const parent = toolCallIdOf(context);
		if (!settings || !reporter || !parent || !characterId) return OUTSIDE_CONVERSATION;
		if (!settings.claude.model) return NO_CLAUDE_MODEL;
		if (settings.claude.auth === "api_key" && !anthropicApiKey()) return NO_ANTHROPIC_KEY;
		const agent = new ClaudeSDKAgent({
			id: "claude-worker",
			name: "Claude",
			description: "Works on tasks handed over by the character agent.",
		});
		const result = await agent.generate(task, {
			sdkOptions: claudeOptions(settings, characterId, reporter, parent),
			abortSignal: context.abortSignal ?? reporter.signal,
		});
		return result.text.trim() || CLAUDE_SILENT;
	},
});

/** The hand-off tool, while Claude Agent SDK is turned on. */
export const claudeTools = (settings: AgentSettings): ToolsInput =>
	settings.claude.enabled ? { [DELEGATE_TOOL]: delegate } : {};
