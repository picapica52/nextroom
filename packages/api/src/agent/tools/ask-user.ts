// ask_user, for replies that end with choices for the user to decide: the reply stops once the
// choices are offered (`offeredChoices`), and the one the user picks is sent as their next
// message. So nothing waits here.

import { z } from "zod";
import type { AgentSettings } from "../../settings/agent";
import type { TurnReporter } from "../steps";
import { defineTool, type ToolSet } from "../tool";

const askUser = defineTool({
	name: "ask_user",
	description:
		"Ask the user to choose or confirm something, and end your reply with the choices. " +
		"The choice they pick (or whatever else they say) comes as their next message.",
	schema: z.object({
		question: z.string().min(1).describe("What you are asking."),
		options: z
			.array(
				z.object({
					label: z.string().min(1).describe("The answer, short."),
					description: z.string().optional().describe("What choosing it means, if unclear."),
				}),
			)
			.max(4)
			.optional()
			.describe("The answers to choose from."),
		selectionMode: z
			.enum(["single_select", "multi_select"])
			.optional()
			.describe("multi_select when several options can be true at once."),
	}),
	execute: async (input, call) => {
		const options = input.options ?? [];
		call.context.reporter.offer(call.id, input, {
			text: input.question,
			options,
			multi: !!options.length && input.selectionMode === "multi_select",
		});
		return "The question is shown to the user with the choices. Their answer comes as their next message.";
	},
});

/** The choices tool, when the agent settings turn it on; the game master always has it. */
export function askUserTools(settings: AgentSettings, always = false): ToolSet {
	return always || settings.ask_user.enabled ? { [askUser.name]: askUser } : {};
}

/** The reply is over once it has offered its choices. */
export const offeredChoices = (reporter: TurnReporter) => reporter.offered;
