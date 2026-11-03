// The user's apps (Gmail, Google Calendar and so on) through Composio, limited to the toolkits of
// the agent settings. The session hands the agent a few meta tools: one finds the app actions a
// task needs and another runs them, so the approval looks inside that call at the actions it runs.

import { composioSessionTools, forgetComposioSession } from "../../composio/client";
import { messageOf } from "../../lib/errors";
import type { AgentSettings } from "../../settings/agent";
import { composioApiKey } from "../../settings/chat";
import { APP_FAILED, DECLINED } from "../prompts";
import type { CharacterTool, ToolSet } from "../tool";

const MULTI_EXECUTE = "COMPOSIO_MULTI_EXECUTE_TOOL";

const READ =
	/_(GET|LIST|FETCH|SEARCH|FIND|READ|RETRIEVE|QUERY|DESCRIBE|COUNT|CHECK|LOOKUP|VIEW)(_|$)/;
const WRITE =
	/_(SEND|CREATE|UPDATE|DELETE|REMOVE|ADD|POST|PATCH|PUT|INSERT|MOVE|MODIFY|REPLY|FORWARD|ARCHIVE|TRASH|SET|EDIT|UPLOAD|SHARE|INVITE|CANCEL|ACCEPT|DECLINE|MARK|STAR|APPLY|EXECUTE|RUN|START|STOP|QUICK_ADD)(_|$)/;

/** Only reads, judging by its name; anything unclear counts as a write. */
const readsOnly = (slug: string) => READ.test(slug) && !WRITE.test(slug);

/** The app actions a call runs: those inside the multi-execute call, or the tool itself. */
function actionsOf(tool: string, input: unknown): string[] {
	if (tool !== MULTI_EXECUTE) return tool.startsWith("COMPOSIO_") ? [] : [tool];
	const items = (input as { tools?: { tool_slug?: unknown }[] } | undefined)?.tools ?? [];
	return items.map((i) => String(i?.tool_slug ?? "")).filter(Boolean);
}

function needsApproval(actions: string[], s: AgentSettings["composio"]): boolean {
	return actions.some((a) => (readsOnly(a) ? s.approve_read : s.approve_write));
}

/** The session's tool, asking first where the settings of the call say so. */
function withApproval(tool: CharacterTool): CharacterTool {
	return {
		...tool,
		execute: async (input: unknown, call) => {
			const { reporter, settings } = call.context;
			const actions = actionsOf(tool.name, input);
			if (needsApproval(actions, settings.composio)) {
				const key = [...new Set(actions)].sort().join(",");
				if (!(await reporter.approve(call.id, key, input))) return DECLINED.app;
			}
			try {
				return await tool.execute(input as never, call);
			} catch (error) {
				forgetComposioSession();
				// The reason is for the user (on the step); the character only hears it did not go through.
				reporter.append(call.id, messageOf(error));
				return APP_FAILED;
			}
		},
	} as CharacterTool;
}

/** The session's tools for the toolkits of the settings. */
export async function composioTools(settings: AgentSettings): Promise<ToolSet> {
	const s = settings.composio;
	if (!s.enabled || !s.toolkits.length || !composioApiKey()) return {};
	try {
		const tools = await composioSessionTools(s.toolkits);
		return Object.fromEntries(
			Object.entries(tools).map(([name, tool]) => [name, withApproval(tool)]),
		);
	} catch (error) {
		console.warn("Could not load the Composio tools:", error);
		return {};
	}
}
