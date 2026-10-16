// Every setting the app keeps, in _data/settings.json: the conversation's under `chat`,
// the agent's under `agent`, and the Discord bot's under `discord`. Each section keeps only the
// fields saved, so fields added later take their default.

import { statSync } from "node:fs";
import { join } from "node:path";

import {
	agentSettingsSchema,
	chatSettingsSchema,
	discordSettingsSchema,
} from "@nextroom/contracts";
import { z } from "zod";

import { dataDir } from "../lib/config";
import { readJson, writeJson } from "../lib/storage";

const { browser, sandbox, claude, web_search, topic_search, ask_user, image_gen, composio } =
	agentSettingsSchema.shape;
type ChatShape = typeof chatSettingsSchema.shape;
/** A stored field that no longer fits (a choice since removed) takes its default. */
const storedChatSchema = z.object(
	Object.fromEntries(
		Object.entries(chatSettingsSchema.shape).map(([key, field]) => [
			key,
			(field as z.ZodType).optional().catch(undefined),
		]),
	) as { [K in keyof ChatShape]: z.ZodCatch<z.ZodOptional<ChatShape[K]>> },
);
const storedAgentSchema = z.object({
	browser: browser.partial().optional(),
	sandbox: sandbox.partial().optional(),
	claude: claude.partial().optional(),
	web_search: web_search.partial().optional(),
	topic_search: topic_search.partial().optional(),
	ask_user: ask_user.partial().optional(),
	image_gen: image_gen.partial().optional(),
	composio: composio.partial().optional(),
});
const settingsFileSchema = z.object({
	chat: storedChatSchema.optional(),
	agent: storedAgentSchema.optional(),
	discord: discordSettingsSchema.partial().optional(),
});
type SettingsFile = z.output<typeof settingsFileSchema>;

const path = () => join(dataDir(), "settings.json");

/** The file as last read, kept while its time and size stay the same (it is also edited by hand). */
let cached: { path: string; stamp: string; file: SettingsFile } | null = null;

const stampOf = (file: string) => {
	const stat = statSync(file, { throwIfNoEntry: false });
	return stat ? `${stat.mtimeMs}:${stat.size}` : "";
};

function readSettingsFile(): SettingsFile {
	const file = path();
	const stamp = stampOf(file);
	if (cached?.path !== file || cached.stamp !== stamp) {
		cached = { path: file, stamp, file: readJson(file, settingsFileSchema) ?? {} };
	}
	return structuredClone(cached.file);
}

function writeSettingsFile(data: SettingsFile): void {
	cached = null;
	writeJson(path(), settingsFileSchema, data);
}

export const readSettingsSection = <K extends keyof SettingsFile>(key: K): SettingsFile[K] =>
	readSettingsFile()[key];

export function writeSettingsSection<K extends keyof SettingsFile>(
	key: K,
	value: NonNullable<SettingsFile[K]>,
): void {
	writeSettingsFile({ ...readSettingsFile(), [key]: value });
}
