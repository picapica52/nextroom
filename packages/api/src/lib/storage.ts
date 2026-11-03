import { randomBytes } from "node:crypto";

export const newId = (prefix = "") => `${prefix}${randomBytes(5).toString("hex")}`;

/** `name` without the characters Windows forbids in file names (each as `_`) and without
 *  leading or trailing spaces and dots. */
export const safeFileName = (name: string) =>
	// biome-ignore lint/suspicious/noControlCharactersInRegex: Windows forbids them in file names
	name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/^[ .]+|[ .]+$/g, "");

/** Seconds since the epoch, as the stored files have always kept time. */
export const now = () => Date.now() / 1000;
