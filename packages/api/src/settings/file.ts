// Every setting the app keeps, in the database's `settings` table: the conversation's under
// `chat`, the connections under `connections`, the agent's under `agent`, and the Discord and
// Slack bots' under `discord` and `slack`, and this installation's own id under `install`. Each
// section keeps only the fields saved, so fields added later take their default.

import {
	agentSettingsSchema,
	CONNECTION_KEYS,
	CONNECTION_URLS,
	chatSettingsSchema,
	discordSettingsSchema,
	slackSettingsSchema,
} from "@nextroom/contracts";
import { z } from "zod";

import { readDoc, writeDoc } from "../lib/db";

const { approvals, computer, web_search, topic_search, ask_user, send_photo, composio, routines } =
	agentSettingsSchema.shape;
const storedAgentSchema = z.object({
	approvals: approvals.partial().optional(),
	computer: computer.partial().optional(),
	web_search: web_search.partial().optional(),
	topic_search: topic_search.partial().optional(),
	ask_user: ask_user.partial().optional(),
	send_photo: send_photo.partial().optional(),
	composio: composio.partial().optional(),
	routines: routines.partial().optional(),
});
const storedConnectionsSchema = z.object(
	Object.fromEntries(
		[...CONNECTION_KEYS, ...CONNECTION_URLS].map((k) => [k, z.string().optional()]),
	),
) as z.ZodType<Partial<Record<string, string>>>;
/** The sections, each as stored. */
const SETTINGS_SECTIONS = {
	chat: chatSettingsSchema.partial(),
	connections: storedConnectionsSchema,
	agent: storedAgentSchema,
	discord: discordSettingsSchema.partial(),
	slack: slackSettingsSchema.partial(),
	/** Made on first use and never changed: the id some sign-ins send (ChatGPT's). */
	install: z.object({ device_id: z.uuid() }),
};
type Sections = typeof SETTINGS_SECTIONS;
type Section<K extends keyof Sections> = z.output<Sections[K]>;

export const readSettingsSection = <K extends keyof Sections>(key: K): Section<K> | undefined =>
	(readDoc("settings", key, SETTINGS_SECTIONS[key]) as Section<K> | null) ?? undefined;

export function writeSettingsSection<K extends keyof Sections>(key: K, value: Section<K>): void {
	writeDoc("settings", key, SETTINGS_SECTIONS[key], value as never);
}
