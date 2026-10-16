import type { ItemInstance } from "@headless-tree/core";
import type { WorkspaceFile } from "@nextroom/contracts";

export interface Entry {
	path: string;
	name: string;
	dir: boolean;
	size: number;
}

// Paths never contain ":", so the root's id cannot clash with a file's.
export const ROOT = ":root";
export const NEW_FOLDER = "新しいフォルダー";
export const INDENT = 14;

const idOf = (path: string) => path || ROOT;
export const parentOf = (path: string) =>
	path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
export const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
export const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export function buildIndex(files: WorkspaceFile[]) {
	const items = new Map<string, Entry>([[ROOT, { path: "", name: "", dir: true, size: 0 }]]);
	for (const f of files)
		items.set(f.path, { path: f.path, name: baseName(f.path), dir: f.dir, size: f.size });
	const children = new Map<string, string[]>();
	for (const f of files) {
		// The listing is capped, so a parent may be missing; show such files at the top.
		const parent = items.has(parentOf(f.path)) ? idOf(parentOf(f.path)) : ROOT;
		children.set(parent, [...(children.get(parent) ?? []), f.path]);
	}
	for (const ids of children.values())
		ids.sort((a, b) => {
			const x = items.get(a);
			const y = items.get(b);
			if (x?.dir !== y?.dir) return x?.dir ? -1 : 1;
			return (x?.name ?? "").localeCompare(y?.name ?? "");
		});
	return { items, children };
}

/** The folder a drop or a new item goes into: the folder itself, or the one holding the file. */
export const folderOf = (item: ItemInstance<Entry> | undefined) => {
	const data = item?.getItemData();
	if (!data) return "";
	return data.dir ? data.path : parentOf(data.path);
};

/** The selected items without those inside another selected folder. */
export const topmost = (items: ItemInstance<Entry>[]) => {
	const paths = items.map((i) => i.getItemData().path).filter(Boolean);
	return paths.filter((p) => !paths.some((q) => p.startsWith(`${q}/`)));
};

export function save(url: string) {
	const link = document.createElement("a");
	link.href = url;
	link.download = "";
	link.click();
}

export function uniqueName(taken: Set<string>, dir: string, name: string) {
	let candidate = name;
	for (let n = 2; taken.has(joinPath(dir, candidate)); n++) candidate = `${name} (${n})`;
	return candidate;
}
