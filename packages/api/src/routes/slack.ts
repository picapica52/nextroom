import { type SlackSettingsView, slackSettingsPatchSchema } from "@nextroom/contracts";
import { Hono } from "hono";

import { getSlackSettings, updateSlackSettings } from "../slack/settings";
import { json } from "./inputs";

export const slackRouter = new Hono()
	.get("/settings", (c) => c.json<SlackSettingsView>(getSlackSettings()))
	.patch("/settings", json(slackSettingsPatchSchema), async (c) =>
		c.json<SlackSettingsView>(await updateSlackSettings(c.req.valid("json"))),
	);
