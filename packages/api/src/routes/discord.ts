import { type DiscordSettingsView, discordSettingsPatchSchema } from "@nextroom/contracts";
import { Hono } from "hono";

import { getDiscordSettings, updateDiscordSettings } from "../discord/settings";
import { json } from "./inputs";

export const discordRouter = new Hono()
	.get("/settings", (c) => c.json<DiscordSettingsView>(getDiscordSettings()))
	.patch("/settings", json(discordSettingsPatchSchema), async (c) =>
		c.json<DiscordSettingsView>(await updateDiscordSettings(c.req.valid("json"))),
	);
