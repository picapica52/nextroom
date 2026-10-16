import { Button } from "@nextroom/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@nextroom/ui/components/dialog";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";

/** A page opened over the conversation by its address: its items on the left (on top on a narrow
 *  screen) and the open item beside them. Closing it goes back to the conversation. */
export function RouteDialog({
	title,
	onClose,
	nav,
	children,
}: {
	title: string;
	onClose: () => void;
	nav: ReactNode;
	children: ReactNode;
}) {
	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				showCloseButton={false}
				className="flex h-[min(760px,calc(100dvh-1.5rem))] w-[min(1080px,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-none md:flex-row"
			>
				<DialogTitle className="sr-only">{title}</DialogTitle>
				{nav}
				<div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
			</DialogContent>
		</Dialog>
	);
}

/** The left column of a RouteDialog. */
export function RouteDialogNav({ label, children }: { label: string; children: ReactNode }) {
	return (
		<aside
			aria-label={label}
			className="flex shrink-0 flex-col overflow-hidden border-b-2 bg-muted md:w-64 md:border-r-2 md:border-b-0"
		>
			{children}
		</aside>
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
