import {
	type ChatSettingsView,
	type ChatTurn,
	chatSettingsPatchSchema,
	LLM_PROVIDERS,
} from "@nextroom/contracts";
import { Hono } from "hono";
import { z } from "zod";
import { readChatImage } from "../conversations/images";
import { clipOf } from "../conversations/live-turn";
import { getSession, listSessions } from "../conversations/sessions";
import { submitOpening, submitTurn } from "../conversations/turn";
import { listLlmModels, listOpenrouterImageModels } from "../mastra/model";
import { getSettings, updateSettings } from "../settings/chat";
import { approvalsRouter } from "./agent";
import { bytesOf, json, query } from "./inputs";

export const chatRouter = new Hono()
	.get("/settings", (c) => c.json<ChatSettingsView>(getSettings()))
	.patch("/settings", json(chatSettingsPatchSchema), (c) =>
		c.json<ChatSettingsView>(updateSettings(c.req.valid("json"))),
	)
	.get("/llm-models", query(z.object({ provider: z.string().optional() })), async (c) => {
		const provider = LLM_PROVIDERS.find((p) => p === c.req.valid("query").provider);
		return c.json(await listLlmModels(provider));
	})
	.get(
		"/openrouter-image-models",
		query(z.object({ output: z.enum(["image", "decisions"]) })),
		async (c) => c.json(await listOpenrouterImageModels(c.req.valid("query").output)),
	)
	.get("/sessions", async (c) => c.json(await listSessions()))
	.get("/sessions/:id", async (c) => c.json(await getSession(c.req.param("id"))))
	.route("/sessions", approvalsRouter)
	// One user turn: a WAV recording (transcribed on the server) or typed text, and any images.
	.post("/sessions/:id/turns", async (c) => {
		const form = await c.req.parseBody({ all: true });
		const audio = form.audio instanceof File ? await bytesOf(form.audio) : null;
		const text = typeof form.text === "string" ? form.text : "";
		const images = await Promise.all(
			[form.images].flat().flatMap((f) => (f instanceof File ? [bytesOf(f)] : [])),
		);
		return c.json<ChatTurn>(
			await submitTurn(c.req.param("id"), text, audio, form.speak === "1", images),
		);
	})
	.get("/sessions/:id/images/:image", (c) => {
		const { bytes, type } = readChatImage(c.req.param("id"), c.req.param("image"));
		return new Response(bytes as Uint8Array<ArrayBuffer>, {
			headers: { "content-type": type, "cache-control": "private, max-age=31536000, immutable" },
		});
	})
	// The character speaks first, when it has something to start the conversation with; null
	// when it does not (the user speaks first).
	.post("/sessions/:id/opening", query(z.object({ speak: z.string().optional() })), async (c) =>
		c.json<ChatTurn | null>(
			await submitOpening(c.req.param("id"), c.req.valid("query").speak === "1"),
		),
	)
	.get(
		"/sessions/:id/audio/:name",
		(c) =>
			new Response(clipOf(c.req.param("id"), c.req.param("name")) as Uint8Array<ArrayBuffer>, {
				headers: { "content-type": "audio/wav", "cache-control": "no-store" },
			}),
	);
