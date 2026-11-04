import { Button } from "@nextroom/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@nextroom/ui/components/dialog";
import { cn } from "@nextroom/ui/lib/utils";
import { ChevronLeft, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** A page opened over the conversation by its address: its items on the left and the open item
 *  beside them. On a narrow screen it fills the screen and shows one of the two at a time (`show`).
 *  Closing it goes back to the conversation. */
export function RouteDialog({
	title,
	onClose,
	nav,
	show = "page",
	children,
}: {
	title: string;
	onClose: () => void;
	nav: ReactNode;
	/** What a narrow screen shows: the list of items, or the open item. */
	show?: "nav" | "page";
	children: ReactNode;
}) {
	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				showCloseButton={false}
				className={cn(
					"flex h-[min(760px,calc(100dvh-1.5rem))] w-[min(1080px,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-none md:flex-row",
					// A narrow screen: the whole screen, clear of the notch and the home bar.
					"max-md:inset-0 max-md:top-0! max-md:h-dvh max-md:max-h-none! max-md:w-full max-md:translate-x-0 max-md:translate-y-0 max-md:overflow-hidden! max-md:rounded-none max-md:border-0 max-md:pt-[env(safe-area-inset-top)] max-md:pr-[env(safe-area-inset-right)] max-md:pb-[env(safe-area-inset-bottom)]! max-md:pl-[env(safe-area-inset-left)]",
				)}
			>
				<DialogTitle className="sr-only">{title}</DialogTitle>
				<div className={cn("contents", show === "page" && "max-md:hidden")}>{nav}</div>
				<div
					className={cn("flex min-h-0 min-w-0 flex-1 flex-col", show === "nav" && "max-md:hidden")}
				>
					{children}
				</div>
			</DialogContent>
		</Dialog>
	);
}

/** The left column of a RouteDialog; on a narrow screen, the whole screen. */
export function RouteDialogNav({ label, children }: { label: string; children: ReactNode }) {
	return (
		<aside
			aria-label={label}
			className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted md:w-64 md:flex-none md:shrink-0 md:border-r-2"
		>
			{children}
		</aside>
	);
}

/** Goes back from the open item to the list of items; only on a narrow screen. */
export function RouteDialogBack({ to, label }: { to: string; label: string }) {
	return (
		<Button
			variant="ghost"
			size="icon-sm"
			className="-ml-1.5 md:hidden"
			aria-label={label}
			title={label}
			nativeButton={false}
			render={<Link to={to} />}
		>
			<ChevronLeft />
		</Button>
	);
}

export function RouteDialogClose({ onClose }: { onClose: () => void }) {
	return (
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label="閉じる"
			title="閉じる（Esc）"
			onClick={onClose}
		>
			<XIcon />
		</Button>
	);
}
