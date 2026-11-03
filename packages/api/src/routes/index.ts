import { Hono } from "hono";

import { isApiError, messageOf } from "../lib/errors";
import { agentRouter, memoryRouter } from "./agent";
import { charactersRouter } from "./characters";
import { chatRouter } from "./chat";
import { desktopsRouter } from "./desktops";
import { discordRouter } from "./discord";
import { elevenlabsRouter } from "./elevenlabs";
import { engineRouter } from "./engine";
import { fishAudioRouter } from "./fish-audio";
import { routinesRouter } from "./routines";
import { systemRouter } from "./system";
import { workspacesRouter } from "./workspaces";

/** Everything under `/api`. Errors answer as `{detail}`, as the screens expect. */
export const apiRouter = new Hono()
	.route("/", systemRouter)
	.route("/engine", engineRouter)
	.route("/elevenlabs", elevenlabsRouter)
	.route("/fish-audio", fishAudioRouter)
	.route("/chat", chatRouter)
	.route("/characters", charactersRouter)
	.route("/discord", discordRouter)
	.route("/agent", agentRouter)
	.route("/desktops", desktopsRouter)
	.route("/workspaces", workspacesRouter)
	.route("/memory", memoryRouter)
	.route("/routines", routinesRouter)
	.all("/*", (c) => c.json({ detail: "見つかりません" }, 404))
	.onError((error, c) => {
		if (isApiError(error)) return c.json({ detail: error.message }, error.status);
		console.error(error);
		return c.json({ detail: messageOf(error) }, 500);
	});

/** The routes under `/api`, for a typed client (`hc<AppType>("/api")`). */
export type AppType = typeof apiRouter;
