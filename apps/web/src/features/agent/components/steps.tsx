import type { AgentStep } from "@nextroom/contracts";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@nextroom/ui/components/collapsible";
import { Spinner } from "@nextroom/ui/components/spinner";
import { cn } from "@nextroom/ui/lib/utils";
import { Ban, Check, ChevronRight, Hand, X } from "lucide-react";
import { KINDS, stepLabel } from "../labels";
import { ApprovalActions } from "./approval-actions";
import { clipText, StepDetail } from "./step-detail";

function StatusIcon({ status }: { status: AgentStep["status"] }) {
	if (status === "running") return <Spinner className="size-3.5 text-muted-foreground" />;
	if (status === "awaiting")
		return <Hand className="size-3.5 text-warning" aria-label="確認待ち" />;
	if (status === "done") return <Check className="size-3.5 text-success" aria-label="完了" />;
	if (status === "declined")
		return <Ban className="size-3.5 text-muted-foreground" aria-label="許可しなかった" />;
	return <X className="size-3.5 text-destructive" aria-label="失敗" />;
}

/** The agent's tool calls during a reply; Claude's own calls nest under the hand-off. */
export function StepList({ sessionId, steps }: { sessionId: string; steps: AgentStep[] }) {
	const top = steps.filter((s) => !s.parent);
	if (!top.length) return null;
	return (
		<ol className="m-0 flex list-none flex-col gap-1.5 p-0">
			{top.map((step) => (
				<li key={step.id}>
					<StepRow sessionId={sessionId} step={step} />
					{steps.some((s) => s.parent === step.id) && (
						<ol className="m-0 mt-1.5 ml-4 flex list-none flex-col gap-1.5 border-l pl-3">
							{steps
								.filter((s) => s.parent === step.id)
								.map((child) => (
									<li key={child.id}>
										<StepRow sessionId={sessionId} step={child} />
									</li>
								))}
						</ol>
					)}
				</li>
			))}
		</ol>
	);
}

function StepRow({ sessionId, step }: { sessionId: string; step: AgentStep }) {
	const kind = KINDS[step.kind] ?? KINDS.other;
	const Icon = kind.icon;
	const header = (
		<span className="flex min-w-0 flex-1 items-center gap-2">
			<Icon className={cn("size-3.5 shrink-0", kind.tone)} aria-hidden="true" />
			<span className="shrink-0 font-medium">{stepLabel(step)}</span>
			{step.input && (
				<span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
					{clipText(step.input, 300)}
				</span>
			)}
			<span className="ml-auto flex shrink-0 items-center">
				<StatusIcon status={step.status} />
			</span>
		</span>
	);
	return (
		<div className="rounded-lg border-2 bg-background text-xs">
			<Collapsible>
				<CollapsibleTrigger className="group/step flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left">
					<ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform group-data-panel-open/step:rotate-90" />
					{header}
				</CollapsibleTrigger>
				<CollapsibleContent>
					<StepDetail step={step} className="border-t px-3 py-2" />
				</CollapsibleContent>
			</Collapsible>
			{step.status === "awaiting" && step.approval && (
				<ApprovalBox sessionId={sessionId} step={step} />
			)}
		</div>
	);
}

/** Asks whether the call may run, under its row. */
function ApprovalBox({ sessionId, step }: { sessionId: string; step: AgentStep }) {
	return (
		<div className="flex flex-col gap-2 border-t border-warning/30 bg-warning/5 px-3 py-2.5">
			<div className="text-sm font-medium">「{stepLabel(step)}」を実行してよいですか？</div>
			<ApprovalActions
				sessionId={sessionId}
				step={step}
				detailClassName="m-0 max-h-32 overflow-auto rounded-md border bg-background px-2.5 py-1.5 font-mono text-[11px] whitespace-pre-wrap break-all"
			/>
		</div>
	);
}
