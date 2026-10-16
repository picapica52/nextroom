// Mastra's ask_user, for replies that end with choices for the user to decide: the reply stops
// once the choices are offered (`offeredChoices`), and the one the user picks is sent as their
// next message. So nothing waits here; Mastra's tool runs without its suspend and words the
// result as it does outside an agent run.

import type { ToolsInput } from "@mastra/core/agent";
import { askUserTool, createTool } from "@mastra/core/tools";
import type { AgentSettings } from "../../settings/agent";
import { contextValue, toolCallIdOf } from "../context";
import { OUTSIDE_CONVERSATION } from "../prompts";
import type { TurnReporter } from "../steps";

type AskUserContext = Parameters<NonNullable<typeof askUserTool.execute>>[1];

const askUser = createTool({
	id: askUserTool.id,
	description:
		"Ask the user to choose or confirm something, and end your reply with the choices. " +
		"The choice they pick (or whatever else they say) comes as their next message.",
	inputSchema: askUserTool.inputSchema,
	execute: async (input, context) => {
		const reporter = contextValue(context, "reporter");
		const id = toolCallIdOf(context);
		if (!reporter || !id) return OUTSIDE_CONVERSATION;
		const options = input.options ?? [];
		reporter.offer(id, input, {
			text: input.question,
			options,
			multi: !!options.length && input.selectionMode === "multi_select",
		});
		const unsuspended = { ...context, agent: { ...context.agent, suspend: undefined } };
		return askUserTool.execute?.(input, unsuspended as unknown as AskUserContext);
	},
});

/** The choices tool, when the agent settings turn it on. */
export function askUserTools(settings: AgentSettings): ToolsInput {
	return settings.ask_user.enabled ? { [askUser.id]: askUser } : {};
}

/** Stops the reply once it has offered its choices. */
export const offeredChoices = (reporter: TurnReporter) => () => reporter.offered;
