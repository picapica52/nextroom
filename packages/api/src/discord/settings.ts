import {
	type DiscordSettings,
	type DiscordSettingsPatch,
	type DiscordSettingsView,
	discordSettingsSchema,
} from "@nextroom/contracts";

import { parseOrBadRequest } from "../lib/errors";
import { readSettingsSection, writeSettingsSection } from "../settings/file";
import { discordStatus, restartDiscordBot } from "./bot";

const DISCORD_DEFAULTS: DiscordSettings = {
	enabled: false,
	bot_token: "",
	character_id: null,
	greet: true,
	silence_ms: 800,
};

export const loadDiscordSettings = (): DiscordSettings => ({
	...DISCORD_DEFAULTS,
	...readSettingsSection("discord"),
});

/** The bot's token, or DISCORD_BOT_TOKEN. */
export const discordToken = (s = loadDiscordSettings()) =>
	s.bot_token || process.env.DISCORD_BOT_TOKEN || "";

export function getDiscordSettings(): DiscordSettingsView {
	const { bot_token: _, ...settings } = loadDiscordSettings();
	return { ...settings, has_bot_token: Boolean(discordToken()), status: discordStatus() };
}

/** Changes the given fields; the bot logs in again when how it logs in changed. */
export async function updateDiscordSettings(patch: DiscordSettingsPatch) {
	const before = loadDiscordSettings();
	const settings = parseOrBadRequest(discordSettingsSchema, { ...before, ...patch });
	writeSettingsSection("discord", settings);
	if (settings.enabled !== before.enabled || settings.bot_token !== before.bot_token)
		await restartDiscordBot();
	return getDiscordSettings();
}
