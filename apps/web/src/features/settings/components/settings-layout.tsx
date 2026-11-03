import { Label } from "@nextroom/ui/components/label";
import { cn } from "@nextroom/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";
import { UnsavedGuard } from "@/components/save-field";

/** The scrolling part of a settings page, where its groups stack. */
export function SettingsPageBody({ children }: { children: ReactNode }) {
	return (
		<div className="min-h-0 flex-1 overflow-y-auto bg-muted">
			<div className="mx-auto flex w-full max-w-2xl flex-col gap-7 px-4 py-6 sm:px-6">
				<UnsavedGuard>{children}</UnsavedGuard>
			</div>
		</div>
	);
}

/** A group of settings: a small title over one card, its rows divided by thin lines. */
export function SettingsGroup({
	title,
	action,
	children,
}: {
	title?: string;
	/** At the right of the title, such as a status. */
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-2">
			{(title || action) && (
				<div className="flex min-h-6 items-center gap-2 px-1">
					{title && <h2 className="m-0 text-sm font-extrabold">{title}</h2>}
					{action && <div className="ml-auto">{action}</div>}
				</div>
			)}
			<div className="flex flex-col divide-y divide-foreground/15 rounded-xl border-2 bg-card shadow-puff">
				{children}
			</div>
		</section>
	);
}

/** One setting: its name (and a short hint) on the left, its control on the right, and anything
 *  more below. */
export function SettingsRow({
	label,
	htmlFor,
	hint,
	control,
	children,
}: {
	label: ReactNode;
	htmlFor?: string;
	hint?: ReactNode;
	control?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3 px-4 py-3">
			<div className="flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2">
				<div className="flex min-w-0 flex-col gap-0.5">
					{htmlFor ? (
						<Label htmlFor={htmlFor} className="text-sm font-normal">
							{label}
						</Label>
					) : (
						<div className="text-sm">{label}</div>
					)}
					{hint && <p className="m-0 text-xs text-muted-foreground">{hint}</p>}
				</div>
				{control && (
					<div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">{control}</div>
				)}
			</div>
			{children}
		</div>
	);
}

/** Free-form content inside a group, padded like a row. */
export function SettingsBlock({
	className,
	children,
}: {
	className?: string;
	children: ReactNode;
}) {
	return <div className={cn("flex flex-col gap-3 px-4 py-3", className)}>{children}</div>;
}

/** A row that opens to show more below it (a provider's key, the rarely changed settings). */
export function SettingsDisclosure({
	label,
	status,
	defaultOpen = false,
	children,
}: {
	label: ReactNode;
	/** At the right, before the chevron, such as whether a key is set. */
	status?: ReactNode;
	defaultOpen?: boolean;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className="flex flex-col">
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
				className="flex min-h-15 w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors duration-120 ease-smooth outline-none first:rounded-t-[10px] last:rounded-b-[10px] hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				<span className="min-w-0 flex-1 truncate">{label}</span>
				{status}
				<ChevronRight
					className={cn(
						"size-4 shrink-0 text-muted-foreground transition-transform duration-120",
						open && "rotate-90",
					)}
					aria-hidden="true"
				/>
			</button>
			{open && <div className="flex flex-col gap-3 px-4 pb-4">{children}</div>}
		</div>
	);
}

/** Rows boxed on their own inside an opened row (a provider's key and its check). */
export function SettingsInset({ children }: { children: ReactNode }) {
	return (
		<div className="flex flex-col divide-y divide-foreground/15 rounded-lg border-2 [&>*]:px-3">
			{children}
		</div>
	);
}
