import type { AgentStep } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { ErrorNote } from "@/components/status";
import { useApprove } from "../queries";
import { clipText } from "./step-detail";

/** What a waiting call would run, then: allow once, allow for the rest of the conversation, or decline. */
export function ApprovalActions({
	sessionId,
	step,
	detailClassName,
}: {
	sessionId: string;
	step: AgentStep;
	detailClassName: string;
}) {
	const approve = useApprove(sessionId);
	const answer = (approved: boolean, always = false) =>
		step.approval && approve.mutate({ approval: step.approval, approved, always });
	return (
		<>
			{step.input && <pre className={detailClassName}>{clipText(step.detail || step.input)}</pre>}
			<div className="flex flex-wrap gap-2">
				<Button size="sm" disabled={approve.isPending} onClick={() => answer(true)}>
					許可
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={approve.isPending}
					onClick={() => answer(true, true)}
				>
					この会話では常に許可
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={approve.isPending}
					onClick={() => answer(false)}
				>
					拒否
				</Button>
			</div>
			<ErrorNote error={approve.error} />
		</>
	);
}
