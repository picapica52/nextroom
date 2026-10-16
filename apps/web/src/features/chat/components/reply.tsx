import type { AgentStep, StepKind } from "@nextroom/contracts";
import { Spinner } from "@nextroom/ui/components/spinner";
import { cn } from "@nextroom/ui/lib/utils";
import { Ban, Check, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { ApprovalActions } from "@/features/agent/components/approval-actions";
import { clipText, StepDetailDialog } from "@/features/agent/components/step-detail";
import { KINDS, shortStepLabel } from "@/features/agent/labels";

interface Group {
	kind: StepKind;
	steps: AgentStep[];
}

const isHandoff = (step?: AgentStep) => step?.tool === "delegate_to_claude";

/** Tool calls in a row of the same kind make one card; each hand-off to Claude is its own. */
function groupSteps(steps: AgentStep[]): Group[] {
	const groups: Group[] = [];
	for (const step of steps) {
		// The choices (ask) are offered under the conversation.
		if (step.parent || step.kind === "ask") continue;
		const last = groups.at(-1);
		if (last && last.kind === step.kind && !isHandoff(step) && !isHandoff(last.steps[0]))
			last.steps.push(step);
		else groups.push({ kind: step.kind, steps: [step] });
	}
	return groups;
}

function groupStatus(steps: AgentStep[]): { text: string; tone: string } {
	if (steps.some((s) => s.status === "awaiting")) return { text: "確認待ち", tone: "text-warning" };
	if (steps.some((s) => s.status === "running")) return { text: "実行中", tone: "text-warning" };
	if (steps.some((s) => s.status === "error")) return { text: "失敗", tone: "text-destructive" };
	if (steps.every((s) => s.status === "declined"))
		return { text: "許可されませんでした", tone: "text-muted-foreground" };
	return { text: "完了", tone: "text-success" };
}

/** The latest TodoWrite of a hand-off, as "TODO 2/3". */
function todoProgress(children: AgentStep[]): string | null {
	const todo = children.filter((c) => c.tool === "claude:TodoWrite").at(-1);
	const match = todo?.input.match(/^TODO (\d+\/\d+)/);
	return match ? `TODO ${match[1]}` : null;
}

function StepMark({ status }: { status: AgentStep["status"] }) {
	if (status === "running") return <Spinner className="size-3.5 text-warning" />;
	if (status === "awaiting")
		return (
			<span
				role="img"
				className="size-2.5 rounded-full border-2 border-warning"
				aria-label="確認待ち"
			/>
		);
	if (status === "done") return <Check className="size-3.5 text-success" aria-label="完了" />;
	if (status === "declined")
		return <Ban className="size-3.5 text-muted-foreground" aria-label="許可されませんでした" />;
	return <X className="size-3.5 text-destructive" aria-label="失敗" />;
}

/** One action in a card: its tool and what it was asked; clicking it shows the input and output in a modal. */
function ActionRow({ step, label }: { step: AgentStep; label: string }) {
	const [open, setOpen] = useState(false);
	return (
		<li className="flex animate-slide-in items-start gap-2">
			<span className="mt-1 flex w-3.5 shrink-0 justify-center">
				<StepMark status={step.status} />
			</span>
			<button
				type="button"
				className="-mx-1 flex min-w-0 flex-1 items-baseline gap-2 rounded-md px-1 py-0.5 text-left transition-colors duration-120 ease-smooth hover:bg-hover active:bg-pressed"
				onClick={() => setOpen(true)}
			>
				<span className="shrink-0 font-mono text-xs text-info">{label}</span>
				<span className="min-w-0 truncate text-foreground/80">{clipText(step.input, 300)}</span>
			</button>
			<StepDetailDialog step={step} open={open} onOpenChange={setOpen} />
		</li>
	);
}

function ToolCard({ group, all }: { group: Group; all: AgentStep[] }) {
	const [open, setOpen] = useState(true);
	const kind = KINDS[group.kind] ?? KINDS.other;
	const Icon = kind.icon;
	const first = group.steps[0];
	const handoff = isHandoff(first);
	const children = handoff && first ? all.filter((s) => s.parent === first.id) : [];
	const status = groupStatus([...group.steps, ...children]);
	const todo = todoProgress(handoff ? children : group.steps);
	const subtitle =
		group.kind === "browser"
			? `@mastra/stagehand ・ ${group.steps.length} アクション`
			: group.kind === "sandbox"
				? `Workspace ・ ${group.steps.length} 件`
				: handoff
					? `ClaudeSDKAgent ・ ${first?.input ?? ""}`
					: group.kind === "claude"
						? `${group.steps.length} アクション`
						: (first?.tool ?? "");
	return (
		<div className="overflow-hidden rounded-xl border-2 shadow-puff">
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
				className="flex w-full items-center gap-2 bg-muted px-3 py-2 text-left text-xs transition-colors duration-120 ease-smooth hover:bg-accent"
			>
				<ChevronRight
					className={cn(
						"size-3 shrink-0 text-muted-foreground transition-transform duration-200 ease-smooth",
						open && "rotate-90",
					)}
					aria-hidden="true"
				/>
				<Icon className={cn("size-3.5 shrink-0", kind.tone)} aria-hidden="true" />
				<span className="shrink-0 font-semibold">{kind.title}</span>
				<span className="min-w-0 truncate text-muted-foreground" title={subtitle}>
					{subtitle}
				</span>
				<span className={cn("ml-auto shrink-0 font-medium", status.tone)}>
					{status.text}
					{todo && status.text === "実行中" ? ` ・ ${todo}` : ""}
				</span>
			</button>
			<div
				inert={!open}
				className={cn(
					"grid transition-[grid-template-rows] duration-260 ease-snap",
					open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
				)}
			>
				<div className="min-h-0 overflow-hidden">
					<ul className="m-0 flex list-none flex-col gap-1 border-t px-3 py-2.5 text-[13px]">
						{handoff ? (
							children.length ? (
								children.map((c) => <ActionRow key={c.id} step={c} label={shortStepLabel(c)} />)
							) : (
								<li className="wrap-anywhere text-muted-foreground">
									{first?.status === "running"
										? "作業を始めています…"
										: clipText(first?.output ?? "")}
								</li>
							)
						) : (
							group.steps.map((s) => (
								<ActionRow
									key={s.id}
									step={s}
									label={group.kind === "claude" ? shortStepLabel(s) : s.tool}
								/>
							))
						)}
					</ul>
					{handoff && first?.output && first.status !== "running" && children.length > 0 && (
						<p className="m-0 border-t px-3 py-2 text-xs leading-relaxed wrap-anywhere whitespace-pre-wrap text-muted-foreground">
							{clipText(first.output)}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}

/** "May this run?" for a tool call waiting on the user, shown apart from the reply's tool cards. */
export function ApprovalCard({ sessionId, step }: { sessionId: string; step: AgentStep }) {
	const where = step.parent
		? "Claude が"
		: KINDS[step.kind].title === "ツール"
			? ""
			: `${KINDS[step.kind].title}で`;
	return (
		<div className="flex animate-rise flex-col gap-2.5 rounded-xl border-2 bg-pastel-peach/40 p-3 shadow-puff">
			<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
				<span className="text-[13px] font-semibold">
					{where}「{shortStepLabel(step)}」を実行してよいですか？
				</span>
				<span className="font-mono text-[11px] text-muted-foreground">{step.tool}</span>
			</div>
			<ApprovalActions
				sessionId={sessionId}
				step={step}
				detailClassName="m-0 max-h-32 overflow-auto rounded-md border bg-background px-2.5 py-2 font-mono text-xs whitespace-pre-wrap break-all"
			/>
		</div>
	);
}

/** The tool cards of a reply; a call waiting for the go-ahead is asked in an ApprovalCard instead. */
export function ReplySteps({ steps }: { steps: AgentStep[] }) {
	const groups = groupSteps(steps);
	if (!groups.length) return null;
	return (
		<div className="flex w-full min-w-0 flex-col gap-2.5">
			{groups.map((g) => (
				<ToolCard key={g.steps[0]?.id} group={g} all={steps} />
			))}
		</div>
	);
}
