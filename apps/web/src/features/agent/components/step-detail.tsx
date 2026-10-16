import type { AgentStep } from "@nextroom/contracts";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@nextroom/ui/components/dialog";
import { cn } from "@nextroom/ui/lib/utils";
import { stepLabel } from "../labels";

/** Longer text would make the page too heavy to render. */
const MAX_SHOWN = 10000;

export const clipText = (text: string, max = MAX_SHOWN) =>
	text.length > max ? `${text.slice(0, max)}…（${text.length - max} 文字省略）` : text;

/** A tool call's input and output, shown when its row in the log is opened. */
export function StepDetail({
	step,
	className,
	boxClassName = "max-h-60",
}: {
	step: AgentStep;
	className?: string;
	boxClassName?: string;
}) {
	const input = step.detail || step.input;
	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<Section label="Input" text={input} boxClassName={boxClassName} />
			<Section
				label="Output"
				text={step.output}
				empty={step.status === "running" ? "実行中…" : "（出力なし）"}
				boxClassName={boxClassName}
			/>
		</div>
	);
}

/** The same input and output in a modal. */
export function StepDetailDialog({
	step,
	open,
	onOpenChange,
}: {
	step: AgentStep;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[90svh] w-[min(900px,calc(100vw-2rem))] max-w-none flex-col gap-3 sm:max-w-none">
				<DialogHeader className="pr-8">
					<DialogTitle>{stepLabel(step)}</DialogTitle>
					<DialogDescription className="font-mono text-xs">{step.tool}</DialogDescription>
				</DialogHeader>
				<StepDetail step={step} className="min-h-0 overflow-auto" boxClassName="max-h-[36svh]" />
			</DialogContent>
		</Dialog>
	);
}

function Section({
	label,
	text,
	empty = "（なし）",
	boxClassName,
}: {
	label: string;
	text: string;
	empty?: string;
	boxClassName?: string;
}) {
	return (
		<div className="flex min-w-0 flex-col gap-1">
			<div className="text-[11px] font-medium text-muted-foreground">{label}</div>
			<pre
				className={cn(
					"m-0 overflow-auto rounded-md bg-muted/60 px-2.5 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all",
					boxClassName,
				)}
			>
				{text ? clipText(text) : <span className="text-muted-foreground">{empty}</span>}
			</pre>
		</div>
	);
}
