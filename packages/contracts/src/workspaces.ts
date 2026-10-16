// Workspaces: each character has one (_data/characters/<id>/workspace), where the agent's file
// and command tools and Claude Agent SDK all work.

import { z } from "zod";

/** A file or folder inside a workspace, by its path relative to it. */
const entryPathSchema = z
	.string()
	.min(1, "パスを指定してください")
	.refine(
		(path) =>
			path.split("/").every((part) => part && !/[\\:*?"<>|]/.test(part) && !/^\.+$/.test(part)),
		'\\ : * ? " < > | や空の名前は使えません',
	);

export const workspacePathSchema = z.object({ path: entryPathSchema });

export const movedWorkspaceEntrySchema = z.object({ from: entryPathSchema, to: entryPathSchema });

export interface WorkspaceFile {
	path: string;
	size: number;
	dir: boolean;
	modified_at: number;
}
