import {
	type SlackSettings,
	type SlackSettingsPatch,
	type SlackSettingsView,
	slackSettingsSchema,
} from "@nextroom/contracts";

import { parseOrBadRequest } from "../lib/errors";
import { readSettingsSection, writeSettingsSection } from "../settings/file";
import { restartSlackBot, slackStatus } from "./bot";

const SLACK_DEFAULTS: SlackSettings = {
	enabled: false,
	bot_token: "",
	app_token: "",
	character_id: null,
};

export const loadSlackSettings = (): SlackSettings => ({
	...SLACK_DEFAULTS,
	...readSettingsSection("slack"),
});

/** The tokens, or SLACK_BOT_TOKEN and SLACK_APP_TOKEN. */
export const slackTokens = (s = loadSlackSettings()) => ({
	bot: s.bot_token || process.env.SLACK_BOT_TOKEN || "",
	app: s.app_token || process.env.SLACK_APP_TOKEN || "",
});

export function getSlackSettings(): SlackSettingsView {
	const { bot_token: _, app_token: __, ...settings } = loadSlackSettings();
	const tokens = slackTokens();
	return {
		...settings,
		has_bot_token: Boolean(tokens.bot),
		has_app_token: Boolean(tokens.app),
		status: slackStatus(),
	};
}

/** Changes the given fields; the bot connects again when how it connects changed. */
export async function updateSlackSettings(patch: SlackSettingsPatch) {
	const before = loadSlackSettings();
	const settings = parseOrBadRequest(slackSettingsSchema, { ...before, ...patch });
	writeSettingsSection("slack", settings);
	if (
		settings.enabled !== before.enabled ||
		settings.bot_token !== before.bot_token ||
		settings.app_token !== before.app_token
	)
		await restartSlackBot();
	return getSlackSettings();
}
