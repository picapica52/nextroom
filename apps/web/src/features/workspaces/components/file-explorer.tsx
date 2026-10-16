import {
	dragAndDropFeature,
	hotkeysCoreFeature,
	type ItemInstance,
	renamingFeature,
	selectionFeature,
	syncDataLoaderFeature,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@nextroom/ui/components/context-menu";
import { Spinner } from "@nextroom/ui/components/spinner";
import { Download, FolderPlus, FolderUp, Pencil, RefreshCw, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConfirm } from "@/components/confirm";
import { EmptyNote, ErrorNote } from "@/components/status";
import {
	downloadUrl,
	useWorkspaceFileActions,
	useWorkspaceFiles,
} from "@/features/workspaces/queries";
import { useFilePicker } from "@/hooks/use-file-picker";
import { filesFromDrop, type PickedFile, pickedFiles } from "@/lib/audio-upload";
import {
	baseName,
	buildIndex,
	type Entry,
	folderOf,
	INDENT,
	joinPath,
	NEW_FOLDER,
	parentOf,
	ROOT,
	topmost,
	uniqueName,
} from "../file-tree";
import { FileRow, ToolButton } from "./file-row";

/** The character's workspace files as a tree: open folders, drop files in, drag to move, rename, delete. */
export function FileExplorer({ characterId, version }: { characterId: string; version: number }) {
	const files = useWorkspaceFiles(characterId, version);
	const actions = useWorkspaceFileActions(characterId);
	const confirm = useConfirm();
	const index = useMemo(() => buildIndex(files.data ?? []), [files.data]);
	const [error, setError] = useState<unknown>(null);
	const [menuItems, setMenuItems] = useState<ItemInstance<Entry>[]>([]);
	const uploadDir = useRef("");
	const renameNext = useRef<string | null>(null);

	const run = (work: () => Promise<unknown>) => {
		setError(null);
		void work().catch(setError);
	};

	const upload = (dir: string, picked: PickedFile[]) => {
		if (!picked.length) return;
		if (dir) tree.getItemInstance(dir)?.expand();
		run(() => actions.upload.mutateAsync({ dir, files: picked }));
	};

	const move = (paths: string[], dir: string) => {
		const moves = paths
			.filter((p) => parentOf(p) !== dir)
			.map((from) => ({ from, to: joinPath(dir, baseName(from)) }));
		if (moves.length) run(() => actions.move.mutateAsync(moves));
	};

	const remove = async (paths: string[]) => {
		if (!paths.length) return;
		const ok = await confirm({
			title:
				paths.length === 1
					? `「${baseName(paths[0] ?? "")}」を削除しますか？`
					: `${paths.length} 件を削除しますか？`,
			description: "フォルダは中身ごと削除します。元に戻せません。",
			action: "削除",
			destructive: true,
		});
		if (ok) run(() => actions.remove.mutateAsync(paths));
	};

	const newFolder = (dir: string) => {
		const path = joinPath(dir, uniqueName(new Set(index.items.keys()), dir, NEW_FOLDER));
		if (dir) tree.getItemInstance(dir)?.expand();
		renameNext.current = path;
		run(() => actions.createFolder.mutateAsync(path));
	};

	const filePicker = useFilePicker((picked) => upload(uploadDir.current, pickedFiles(picked)), {
		multiple: true,
	});
	const folderPicker = useFilePicker((picked) => upload(uploadDir.current, pickedFiles(picked)), {
		directory: true,
	});
	const pickFiles = (dir: string, folder: boolean) => {
		uploadDir.current = dir;
		(folder ? folderPicker : filePicker).open();
	};

	const tree = useTree<Entry>({
		rootItemId: ROOT,
		getItemName: (item) => item.getItemData().name,
		isItemFolder: (item) => item.getItemData().dir,
		dataLoader: {
			getItem: (id) => index.items.get(id) ?? { path: id, name: baseName(id), dir: false, size: 0 },
			getChildren: (id) => index.children.get(id) ?? [],
		},
		indent: INDENT,
		canReorder: false,
		canDrop: (_items, target) => target.item.isFolder(),
		canDragForeignDragObjectOver: (data) => data.types.includes("Files"),
		canDropForeignDragObject: (data) => data.types.includes("Files"),
		onDrop: (items, target) => move(topmost(items), folderOf(target.item)),
		onDropForeignDragObject: (data, target) => {
			const dir = folderOf(target.item);
			// The dropped entries can be read only before this handler returns.
			void filesFromDrop(data)
				.then((picked) => upload(dir, picked))
				.catch(setError);
		},
		onRename: (item, value) => {
			const name = value.trim();
			const { path } = item.getItemData();
			if (name && name !== baseName(path))
				run(() => actions.move.mutateAsync([{ from: path, to: joinPath(parentOf(path), name) }]));
		},
		hotkeys: {
			// The Enter that confirms IME conversion must not finish the rename.
			completeRenaming: {
				handler: (e, tree) => {
					if (!e.isComposing && e.keyCode !== 229) tree.completeRenaming();
				},
			},
			customDeleteSelected: {
				hotkey: "Delete",
				handler: () => void remove(topmost(tree.getSelectedItems())),
			},
		},
		features: [
			syncDataLoaderFeature,
			selectionFeature,
			hotkeysCoreFeature,
			dragAndDropFeature,
			renamingFeature,
		],
	});

	useEffect(() => {
		tree.rebuildTree();
		const path = renameNext.current;
		if (path && index.items.has(path)) {
			renameNext.current = null;
			const item = tree.getItemInstance(path);
			tree.setSelectedItems([path]);
			item.setFocused();
			item.startRenaming();
		}
	}, [tree, index]);

	const selectedDir = () => {
		const selected = tree.getSelectedItems();
		return selected.length === 1 ? folderOf(selected[0]) : "";
	};
	const busy =
		actions.upload.isPending ||
		actions.move.isPending ||
		actions.remove.isPending ||
		actions.createFolder.isPending;
	const items = tree.getItems();
	const menuDir = menuItems.length === 1 ? folderOf(menuItems[0]) : "";
	const menuFile = menuItems.length === 1 && !menuItems[0]?.getItemData().dir ? menuItems[0] : null;

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-0.5">
				<ToolButton label="ファイルをアップロード" onClick={() => pickFiles(selectedDir(), false)}>
					<Upload />
				</ToolButton>
				<ToolButton label="フォルダをアップロード" onClick={() => pickFiles(selectedDir(), true)}>
					<FolderUp />
				</ToolButton>
				<ToolButton label="新しいフォルダー" onClick={() => newFolder(selectedDir())}>
					<FolderPlus />
				</ToolButton>
				<ToolButton label="再読み込み" onClick={() => run(actions.refresh)}>
					<RefreshCw />
				</ToolButton>
				{(busy || files.isFetching) && (
					<Spinner className="ml-auto size-3.5 text-muted-foreground" />
				)}
			</div>
			{actions.upload.isPending && (
				<p className="m-0 text-xs text-muted-foreground">
					{actions.upload.variables?.files.length} 件をアップロードしています…
				</p>
			)}
			<ErrorNote error={error} />
			<ContextMenu>
				<ContextMenuTrigger
					onContextMenu={(e) => {
						const row = (e.target as HTMLElement).closest<HTMLElement>("[data-path]");
						const path = row?.dataset.path;
						if (!path) {
							tree.setSelectedItems([]);
							setMenuItems([]);
							return;
						}
						const item = tree.getItemInstance(path);
						if (!item.isSelected()) tree.setSelectedItems([path]);
						item.setFocused();
						setMenuItems(item.isSelected() ? tree.getSelectedItems() : [item]);
					}}
				>
					<div
						{...tree.getContainerProps("ファイル")}
						className="flex min-h-48 flex-col rounded-lg border-2 bg-background p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					>
						{items.map((item) => (
							<FileRow key={item.getId()} item={item} characterId={characterId} />
						))}
						{!files.isPending && !items.length && (
							<EmptyNote className="py-6">ファイルをここにドロップしてアップロード</EmptyNote>
						)}
						<div style={tree.getDragLineStyle()} className="h-0.5 bg-primary" />
					</div>
				</ContextMenuTrigger>
				<ContextMenuContent>
					{menuFile && (
						<ContextMenuItem
							render={<a href={downloadUrl(characterId, menuFile.getItemData().path)} download />}
						>
							<Download />
							ダウンロード
						</ContextMenuItem>
					)}
					{menuItems.length === 1 && (
						<ContextMenuItem onClick={() => menuItems[0]?.startRenaming()}>
							<Pencil />
							名前を変更
						</ContextMenuItem>
					)}
					{menuItems.length > 0 && (
						<>
							<ContextMenuItem
								variant="destructive"
								onClick={() => void remove(topmost(menuItems))}
							>
								<Trash2 />
								削除
							</ContextMenuItem>
							<ContextMenuSeparator />
						</>
					)}
					<ContextMenuItem onClick={() => newFolder(menuDir)}>
						<FolderPlus />
						新しいフォルダー
					</ContextMenuItem>
					<ContextMenuItem onClick={() => pickFiles(menuDir, false)}>
						<Upload />
						ファイルをアップロード
					</ContextMenuItem>
					<ContextMenuItem onClick={() => pickFiles(menuDir, true)}>
						<FolderUp />
						フォルダをアップロード
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
			{filePicker.input}
			{folderPicker.input}
		</div>
	);
}
