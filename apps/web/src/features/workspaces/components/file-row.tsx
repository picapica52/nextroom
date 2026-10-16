import type { ItemInstance } from "@headless-tree/core";
import { Button } from "@nextroom/ui/components/button";
import { cn } from "@nextroom/ui/lib/utils";
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import type { ReactNode } from "react";
import { downloadUrl } from "@/features/workspaces/queries";
import { formatBytes } from "@/lib/api";
import { type Entry, INDENT, save } from "../file-tree";

export function ToolButton({
	label,
	onClick,
	children,
}: {
	label: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<Button variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={onClick}>
			{children}
		</Button>
	);
}

export function FileRow({ item, characterId }: { item: ItemInstance<Entry>; characterId: string }) {
	const data = item.getItemData();
	const level = item.getItemMeta().level;
	const Icon = data.dir ? (item.isExpanded() ? FolderOpen : Folder) : File;
	return (
		<div
			role="treeitem"
			{...item.getProps()}
			data-path={data.path}
			onDoubleClick={() => {
				if (!data.dir) save(downloadUrl(characterId, data.path));
			}}
			style={{ paddingLeft: level * INDENT + 4 }}
			className={cn(
				"flex h-7 cursor-default items-center gap-1.5 rounded-md pr-2 text-xs outline-none select-none transition-colors duration-120 ease-smooth hover:bg-hover",
				item.isSelected() && "bg-selected text-selected-foreground hover:bg-selected",
				item.isFocused() && "ring-1 ring-ring/50 ring-inset",
				item.isUnorderedDragTarget() && "bg-primary/10 ring-1 ring-primary ring-inset",
			)}
		>
			<ChevronRight
				className={cn(
					"size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-smooth",
					!data.dir && "invisible",
					item.isExpanded() && "rotate-90",
				)}
			/>
			<Icon className="size-4 shrink-0 text-muted-foreground" />
			{item.isRenaming() ? (
				<input
					{...item.getRenameInputProps()}
					className="h-5 min-w-0 flex-1 rounded border bg-background px-1 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
				/>
			) : (
				<span className="min-w-0 flex-1 truncate font-mono">{data.name}</span>
			)}
			{!data.dir && (
				<span className="shrink-0 text-muted-foreground">{formatBytes(data.size)}</span>
			)}
		</div>
	);
}
