// Every setting the app keeps, in the database's `settings` table: the conversation's under
// `chat`, the connections under `connections`, the agent's under `agent`, and the Discord bot's
// under `discord`. Each section keeps
// only the fields saved, so fields added later take their default.

import {
	agentSettingsSchema,
	CONNECTION_KEYS,
	CONNECTION_URLS,
	chatSettingsSchema,
	discordSettingsSchema,
} from "@nextroom/contracts";
import { z } from "zod";

import { readDoc, writeDoc } from "../lib/db";

const {
	approvals,
	browser,
	desktop,
	sandbox,
	web_search,
	topic_search,
	ask_user,
	image_gen,
	composio,
	routines,
} = agentSettingsSchema.shape;
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
	approvals: approvals.partial().optional(),
	browser: browser.partial().optional(),
	desktop: desktop.partial().optional(),
	sandbox: sandbox.partial().optional(),
	web_search: web_search.partial().optional(),
	topic_search: topic_search.partial().optional(),
	ask_user: ask_user.partial().optional(),
	image_gen: image_gen.partial().optional(),
	composio: composio.partial().optional(),
	routines: routines.partial().optional(),
});
const storedConnectionsSchema = z.object(
	Object.fromEntries(
		[...CONNECTION_KEYS, ...CONNECTION_URLS].map((k) => [k, z.string().optional()]),
	),
) as z.ZodType<Partial<Record<string, string>>>;
/** The sections, each as stored. */
export const SETTINGS_SECTIONS = {
	chat: storedChatSchema,
	connections: storedConnectionsSchema,
	agent: storedAgentSchema,
	discord: discordSettingsSchema.partial(),
};
type Sections = typeof SETTINGS_SECTIONS;
type Section<K extends keyof Sections> = z.output<Sections[K]>;

export const readSettingsSection = <K extends keyof Sections>(key: K): Section<K> | undefined =>
	(readDoc("settings", key, SETTINGS_SECTIONS[key]) as Section<K> | null) ?? undefined;

export function writeSettingsSection<K extends keyof Sections>(key: K, value: Section<K>): void {
	writeDoc("settings", key, SETTINGS_SECTIONS[key], value as never);
}
