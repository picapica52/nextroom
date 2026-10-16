// The user's apps (Gmail, Google Calendar and so on) through Composio, limited to the toolkits of
// the agent settings. The session hands the agent a few meta tools: one finds the app actions a
// task needs and another runs them, so the approval looks inside that call at the actions it runs.

import type { MastraToolCollection } from "@composio/mastra";
import type { ToolsInput } from "@mastra/core/agent";
import { composioSessionTools, forgetComposioSession } from "../../composio/client";
import { messageOf } from "../../lib/errors";
import type { AgentSettings } from "../../settings/agent";
import { composioApiKey } from "../../settings/chat";
import { contextValue, toolCallIdOf } from "../context";
import { APP_FAILED, DECLINED } from "../prompts";

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

const wrapped = new WeakSet<MastraToolCollection>();

/** The session's tools, asking first where the settings of the call say so. */
export async function composioTools(settings: AgentSettings): Promise<ToolsInput> {
	const s = settings.composio;
	if (!s.enabled || !s.toolkits.length || !composioApiKey()) return {};
	let tools: MastraToolCollection;
	try {
		tools = await composioSessionTools(s.toolkits);
	} catch (error) {
		console.warn("Could not load the Composio tools:", error);
		return {};
	}
	if (wrapped.has(tools)) return tools;
	wrapped.add(tools);
	for (const [name, tool] of Object.entries(tools)) {
		const run = tool.execute;
		if (!run) continue;
		tool.execute = async (input, context) => {
			const reporter = contextValue(context, "reporter");
			const current = contextValue(context, "settings")?.composio ?? s;
			const id = toolCallIdOf(context);
			const actions = actionsOf(name, input);
			if (reporter && id && needsApproval(actions, current)) {
				const key = [...new Set(actions)].sort().join(",");
				if (!(await reporter.approve(id, key, input))) return DECLINED.app;
			}
			try {
				return await run(input, context);
			} catch (error) {
				forgetComposioSession();
				// The reason is for the user (on the step); the character only hears it did not go through.
				if (reporter && id) reporter.append(id, messageOf(error));
				return APP_FAILED;
			}
		};
	}
	return tools;
}
