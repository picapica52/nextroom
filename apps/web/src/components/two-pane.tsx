import { cn } from "@nextroom/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** The look of the selected item of a list in a side pane. */
export const SELECTED_ITEM =
	"border-pastel-yellow-edge bg-selected font-bold text-selected-foreground hover:bg-selected hover:text-selected-foreground";

/** An item of a side pane's list: its name over a line about it (the line only on a wide screen). */
export function SideNavItem({
	to,
	active,
	label,
	summary,
}: {
	to: string;
	active: boolean;
	label: string;
	summary: ReactNode;
}) {
	return (
		<Link
			to={to}
			aria-current={active ? "page" : undefined}
			className={cn(
				"flex shrink-0 flex-col gap-0.5 rounded-lg border-2 border-transparent px-2 py-1.5 text-sm whitespace-nowrap text-foreground no-underline transition-colors duration-120 ease-smooth hover:bg-hover hover:text-foreground active:bg-pressed md:py-2",
				active && SELECTED_ITEM,
			)}
		>
			<span className="truncate">{label}</span>
			<span
				className={cn(
					"hidden truncate text-xs font-normal md:block",
					active ? "text-selected-foreground/80" : "text-muted-foreground",
				)}
			>
				{summary}
			</span>
		</Link>
	);
}

/** The header of the open item's pane: its icon, name and what it is. */
export function PaneHeader({
	icon: Icon,
	title,
	description,
	children,
}: {
	icon: LucideIcon;
	title: ReactNode;
	description: ReactNode;
	/** Shown at the right, such as a close button. */
	children?: ReactNode;
}) {
	return (
		<header className="flex min-h-14 shrink-0 items-center gap-3 border-b-2 px-3 py-2 sm:px-4">
			<div className="flex size-9 shrink-0 items-center justify-center rounded-lg border-2 bg-pastel-lilac shadow-puff">
				<Icon className="size-4.5" aria-hidden="true" />
			</div>
			<div className="min-w-0 flex-1">
				<h1 className="m-0 truncate text-sm font-medium">{title}</h1>
				<div className="truncate text-xs text-muted-foreground">{description}</div>
			</div>
			{children}
		</header>
	);
}
