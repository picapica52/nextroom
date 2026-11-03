import { Label } from "@nextroom/ui/components/label";
import { cn } from "@nextroom/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { UnsavedGuard } from "@/components/save-field";
import { ErrorNote } from "@/components/status";

const ROW = "data-settings-row";

/** Scrolls to the setting named by the address's #anchor once it is on the page, and lights it up
 *  for a moment. */
function useScrollToAnchor() {
	const { hash, key } = useLocation();
	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` reruns it for the same anchor.
	useEffect(() => {
		const id = decodeURIComponent(hash.slice(1));
		if (!id) return;
		let tries = 0;
		let unflash: ReturnType<typeof setTimeout> | undefined;
		const timer = setInterval(() => {
			const target = document.getElementById(id);
			if (!target && ++tries < 40) return;
			clearInterval(timer);
			if (!target) return;
			const row = target.closest<HTMLElement>(`[${ROW}]`) ?? target;
			row.scrollIntoView({ block: "center", behavior: "smooth" });
			row.setAttribute("data-flash", "");
			unflash = setTimeout(() => row.removeAttribute("data-flash"), 1600);
		}, 50);
		return () => {
			clearInterval(timer);
			clearTimeout(unflash);
		};
	}, [hash, key]);
}

/** The look a row takes while it is lit up by useScrollToAnchor. */
const FLASH = "transition-colors duration-500 data-[flash]:bg-selected";
const ROW_FLASH = `${FLASH} first:rounded-t-[10px] last:rounded-b-[10px]`;

/** The scrolling part of a settings page, where its groups stack. */
export function SettingsPageBody({ children }: { children: ReactNode }) {
	useScrollToAnchor();
	return (
		<div className="min-h-0 flex-1 overflow-y-auto bg-muted">
			<div className="mx-auto flex w-full max-w-2xl flex-col gap-7 px-4 py-6 sm:px-6">
				<UnsavedGuard>{children}</UnsavedGuard>
			</div>
		</div>
	);
}

/** A settings page: its body, and along the bottom any save that failed. Until it loads, only
 *  why it has not. */
export function SettingsPage({
	loadError,
	saveError,
	children,
}: {
	loadError?: unknown;
	saveError?: unknown;
	children: ReactNode;
}) {
	return (
		<>
			<SettingsPageBody>
				<ErrorNote error={loadError} />
				{children}
			</SettingsPageBody>
			{!!saveError && (
				<footer className="shrink-0 border-t-2 px-4 py-2.5">
					<ErrorNote error={saveError} />
				</footer>
			)}
		</>
	);
}

/** A group of settings: a small title (and what it is for) over one card, its rows divided by thin
 *  lines. */
export function SettingsGroup({
	id,
	title,
	description,
	action,
	children,
}: {
	/** An anchor the search can scroll to. */
	id?: string;
	title?: string;
	description?: ReactNode;
	/** At the right of the title, such as a status. */
	action?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-2">
			{(title || action) && (
				<div className="flex min-h-6 items-center gap-2 px-1">
					<div className="flex min-w-0 flex-col gap-0.5">
						{title && <h2 className="m-0 text-sm font-extrabold">{title}</h2>}
						{description && <p className="m-0 text-xs text-muted-foreground">{description}</p>}
					</div>
					{action && <div className="ml-auto shrink-0">{action}</div>}
				</div>
			)}
			<div
				id={id}
				{...{ [ROW]: "" }}
				className={cn(
					"flex scroll-mt-4 flex-col divide-y divide-foreground/15 rounded-xl border-2 bg-card shadow-puff",
					FLASH,
				)}
			>
				{children}
			</div>
		</section>
	);
}

/** One setting: its name (and a short hint) on the left, its control on the right, and anything
 *  more below. */
export function SettingsRow({
	id,
	label,
	htmlFor,
	hint,
	control,
	children,
}: {
	/** An anchor the search can scroll to, when the row has no field of its own to point at. */
	id?: string;
	label: ReactNode;
	htmlFor?: string;
	hint?: ReactNode;
	control?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<div id={id} {...{ [ROW]: "" }} className={cn("flex flex-col gap-3 px-4 py-3", ROW_FLASH)}>
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
	return (
		<div {...{ [ROW]: "" }} className={cn("flex flex-col gap-3 px-4 py-3", ROW_FLASH, className)}>
			{children}
		</div>
	);
}

/** A row that opens to show more below it (a provider's key, the rarely changed settings). */
export function SettingsDisclosure({
	id,
	label,
	status,
	defaultOpen = false,
	children,
}: {
	/** An anchor the search can scroll to; it opens when the address points at it. */
	id?: string;
	label: ReactNode;
	/** At the right, before the chevron, such as whether a key is set. */
	status?: ReactNode;
	defaultOpen?: boolean;
	children: ReactNode;
}) {
	const { hash, key } = useLocation();
	const targeted = !!id && decodeURIComponent(hash.slice(1)) === id;
	const [open, setOpen] = useState(defaultOpen || targeted);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` reopens it for the same anchor.
	useEffect(() => {
		if (targeted) setOpen(true);
	}, [targeted, key]);
	return (
		<div id={id} {...{ [ROW]: "" }} className={cn("flex flex-col", ROW_FLASH)}>
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
