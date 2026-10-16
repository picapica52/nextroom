// The Discord bot: a character that joins a voice channel and talks there, under `discord` in
// _data/settings.json.

import { z } from "zod";

export const discordSettingsSchema = z.object({
	/** Log the bot in while the server runs. */
	enabled: z.boolean(),
	/** The bot's token from the Discord Developer Portal. */
	bot_token: z.string().trim(),
	/** The character the bot talks as; its conversation is the one the app shows. */
	character_id: z.string().nullable(),
	/** Someone speaking while the character talks stops it, as in a call in the app. */
	interrupt: z.boolean(),
	/** The character speaks first when it joins, if it has something to start with. */
	greet: z.boolean(),
	/** How long a pause ends what someone said (ms). */
	silence_ms: z.number().int().min(300).max(3000),
});
export type DiscordSettings = z.infer<typeof discordSettingsSchema>;

export const discordSettingsPatchSchema = discordSettingsSchema.partial();
export type DiscordSettingsPatch = z.infer<typeof discordSettingsPatchSchema>;

export const DISCORD_STATES = ["off", "connecting", "ready", "error"] as const;
export type DiscordState = (typeof DISCORD_STATES)[number];

export interface DiscordStatus {
	state: DiscordState;
	/** The bot's name once it is logged in. */
	bot_name: string | null;
	/** The page that adds the bot to a server, once it is logged in. */
	invite_url: string | null;
	/** The voice channel it is in. */
	channel: { guild: string; name: string } | null;
	error: string | null;
}

/** The settings as the API answers them: the token itself is not sent back. */
export type DiscordSettingsView = Omit<DiscordSettings, "bot_token"> & {
	has_bot_token: boolean;
	status: DiscordStatus;
};
