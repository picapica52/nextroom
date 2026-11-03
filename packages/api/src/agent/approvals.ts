// Whether a tool call may run (Settings → 承認). A blocked action is refused without asking and an
// always-allowed one runs, in every mode. Otherwise, by the mode:
//
// - never: everything runs,
// - auto: an action that changes something is checked by the approval model against what the user
//   asked for; one that fits runs, and the user is asked about the rest (as in Ask while no
//   approval model is chosen),
// - ask: the user is asked before any action that changes something.
//
// "Always allow" on the screen adds the action to the rules. With no one there to ask (a routine's
// run), the question is declined.

import type { ApprovalRule } from "@nextroom/contracts";
import { addApprovalRule } from "../settings/agent";
import { loadSettings } from "../settings/chat";
import { generateOnce } from "./llm";
import { DECLINED } from "./prompts";
import { connectionOf } from "./providers";
import type { CharacterTool, ToolCall } from "./tool";

const REVIEW_INSTRUCTIONS = [
	"You review an action an AI character is about to take on the user's computer or accounts.",
	"You get what the user asked for and the action, with its input.",
	'Answer "allow" when the action fits what the user asked for.',
	'Answer "ask" when it is off the request, or cannot be undone (sending, deleting, paying, posting) and the user did not clearly ask for it.',
	"Answer with that one word only.",
].join("\n");

/** Whether the approval model lets the action run without asking. */
async function reviewed(tool: CharacterTool, input: unknown, call: ToolCall): Promise<boolean> {
	const choice = loadSettings().approval_model;
	if (!choice) return false;
	try {
		const answer = await generateOnce(
			connectionOf({ ...choice, thinking: choice.thinking ?? "off" }),
			REVIEW_INSTRUCTIONS,
			[
				`<request>\n${call.context.request || "(none)"}\n</request>`,
				`<action>\n${tool.name}: ${tool.description.split("\n")[0]}\n</action>`,
				`<input>\n${JSON.stringify(input, null, 2).slice(0, 4000)}\n</input>`,
			].join("\n\n"),
			{ temperature: 0, signal: call.signal },
		);
		return answer.trim().toLowerCase().startsWith("allow");
	} catch (error) {
		if (call.signal.aborted) throw error;
		console.warn("The approval model did not answer:", error);
		return false;
	}
}

const ruleOf = (rules: ApprovalRule[], key: string) => rules.findLast((r) => r.tool === key);

/** True when the call may run; otherwise what the tool answers instead. */
export async function mayRun(
	tool: CharacterTool,
	input: unknown,
	call: ToolCall,
): Promise<true | string> {
	const { approvals } = call.context.settings;
	const { reporter } = call.context;
	const key = tool.approvalKey?.(input) ?? tool.name;
	const rule = ruleOf(approvals.rules, key);
	if (rule?.decision === "block") {
		reporter.decline(call.id, key, input);
		return DECLINED.blocked;
	}
	if (rule?.decision === "allow" || approvals.mode === "never") return true;
	const changes = typeof tool.changes === "function" ? tool.changes(input) : !!tool.changes;
	if (!changes) return true;
	if (approvals.mode === "auto" && (await reviewed(tool, input, call))) return true;
	const approved = await reporter.approve(call.id, key, input, () =>
		addApprovalRule({ tool: key, decision: "allow" }),
	);
	if (approved) return true;
	return reporter.unattended ? DECLINED.away : DECLINED.user;
}
