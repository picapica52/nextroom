// Whether a tool call may run (Settings → 承認). A blocked action is refused without asking and an
// always-allowed one runs, in every mode. Otherwise, by the mode:
//
// - never: everything runs,
// - ask: the user is asked before any action that changes something.
//
// "Always allow" on the screen adds the action to the rules. With no one there to ask (a routine's
// run), the question is declined.

import type { ApprovalRule } from "@nextroom/contracts";
import { addApprovalRule } from "../settings/agent";
import { DECLINED } from "./prompts";
import type { CharacterTool, ToolCall } from "./tool";

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
	const approved = await reporter.approve(call.id, key, input, () =>
		addApprovalRule({ tool: key, decision: "allow" }),
	);
	if (approved) return true;
	return reporter.unattended ? DECLINED.away : DECLINED.user;
}
