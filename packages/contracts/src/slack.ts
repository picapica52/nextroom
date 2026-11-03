// The Slack bot: a character that answers in Slack by text, under `slack` in the settings.

import { z } from "zod";

export const slackSettingsSchema = z.object({
	/** Connect the bot while the server runs. */
	enabled: z.boolean(),
	/** The Bot User OAuth Token (xoxb-…). */
	bot_token: z.string().trim(),
	/** The App-Level Token with connections:write (xapp-…), for Socket Mode. */
	app_token: z.string().trim(),
	/** The character the bot talks as; its conversation is the one the app shows. */
	character_id: z.string().nullable(),
});
export type SlackSettings = z.infer<typeof slackSettingsSchema>;

export const slackSettingsPatchSchema = slackSettingsSchema.partial();
export type SlackSettingsPatch = z.infer<typeof slackSettingsPatchSchema>;

const SLACK_STATES = ["off", "connecting", "ready", "error"] as const;
type SlackState = (typeof SLACK_STATES)[number];

export interface SlackStatus {
	state: SlackState;
	/** The bot's name once it is connected. */
	bot_name: string | null;
	/** The workspace it is in. */
	team: string | null;
	error: string | null;
}

/** The settings as the API answers them: the tokens themselves are not sent back. */
export type SlackSettingsView = Omit<SlackSettings, "bot_token" | "app_token"> & {
	has_bot_token: boolean;
	has_app_token: boolean;
	status: SlackStatus;
};
