import type { JobView } from "@nextroom/contracts";
import { Alert, AlertDescription } from "@nextroom/ui/components/alert";
import { Empty, EmptyDescription } from "@nextroom/ui/components/empty";
import { Progress } from "@nextroom/ui/components/progress";
import { cn } from "@nextroom/ui/lib/utils";
import { Check, CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { errorMessage } from "@/lib/api";

export type DotTone = "info" | "success" | "warning" | "destructive" | "muted";

const DOT_TONE: Record<DotTone, string> = {
	info: "bg-pastel-mint",
	success: "bg-background",
	warning: "bg-pastel-peach",
	destructive: "border-destructive bg-background text-destructive",
	muted: "border-dashed border-foreground/50 bg-background text-muted-foreground",
};

/** A status pill; `tone` picks its look. */
export function Dot({ tone, children }: { tone: DotTone; children: ReactNode }) {
	return (
		<span
			className={cn(
				"inline-flex h-5.5 items-center gap-1.5 rounded-full border-[1.5px] border-foreground/15 px-2.5 text-xs font-bold whitespace-nowrap",
				DOT_TONE[tone],
			)}
		>
			{tone === "info" && (
				<span className="size-1.5 shrink-0 animate-pulse rounded-full bg-success" />
			)}
			{tone === "success" && <Check className="size-3 shrink-0 text-success" aria-hidden="true" />}
			{children}
		</span>
	);
}

export function ErrorNote({ error }: { error: unknown }) {
	if (!error) return null;
	return (
		<Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
			<CircleAlert />
			<AlertDescription className="text-destructive">{errorMessage(error)}</AlertDescription>
		</Alert>
	);
}

/** Progress bar; `value` is 0–1. Running jobs get moving stripes, stopped ones turn peach. */
export function Meter({
	value,
	tone = "default",
	className,
}: {
	value: number;
	tone?: "default" | "running" | "stopped";
	className?: string;
}) {
	return (
		<Progress
			value={Math.max(0, Math.min(100, value * 100))}
			className={cn(
				tone === "running" && "[&_[data-slot=progress-indicator]]:progress-stripes",
				tone === "stopped" && "[&_[data-slot=progress-indicator]]:bg-pastel-peach",
				className,
			)}
		/>
	);
}

/** Placeholder for an empty list or table. */
export function EmptyNote({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<Empty className={cn("py-10", className)}>
			<EmptyDescription>{children}</EmptyDescription>
		</Empty>
	);
}

/** A queued or running engine job: its message (or `fallback` before it has one) over a meter. */
export function JobMeter({ job, fallback }: { job: JobView; fallback: string }) {
	return (
		<div className="flex flex-col gap-1.5">
			<div className="text-xs text-muted-foreground">{job.message || fallback}</div>
			<Meter value={job.progress} tone="running" />
		</div>
	);
}
