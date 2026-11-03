// The user's apps (Gmail, Google Calendar and so on) through Composio, limited to the toolkits of
// the agent settings. The session hands the agent a few meta tools: one finds the app actions a
// task needs and another runs them, so the approval looks inside that call at the actions it runs.

import { composioSessionTools, forgetComposioSession } from "../../composio/client";
import { messageOf } from "../../lib/errors";
import type { AgentSettings } from "../../settings/agent";
import { composioApiKey } from "../../settings/chat";
import { APP_FAILED } from "../prompts";
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

/** The session's tool: its app actions are what the approvals look at, and a call changes
 *  something unless every action only reads. */
function withApproval(tool: CharacterTool): CharacterTool {
	return {
		...tool,
		changes: (input: unknown) => actionsOf(tool.name, input).some((a) => !readsOnly(a)),
		approvalKey: (input: unknown) => {
			const actions = actionsOf(tool.name, input);
			return actions.length ? [...new Set(actions)].sort().join(",") : tool.name;
		},
		execute: async (input: unknown, call) => {
			const { reporter } = call.context;
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
