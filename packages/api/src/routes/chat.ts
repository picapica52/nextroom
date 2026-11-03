import {
	type ChatSettingsView,
	type ChatTurn,
	type ConnectionsView,
	chatSettingsPatchSchema,
	connectionsPatchSchema,
	llmProviderSchema,
	loginCodeSchema,
	type ProviderLogin,
	type ProviderStatus,
	providerLoginSchema,
} from "@nextroom/contracts";
import { Hono } from "hono";
import { z } from "zod";
import {
	answerLogin,
	cancelLogin,
	forgetProvider,
	providerLogin,
	providerStatus,
	startProviderLogin,
} from "../agent/auth";
import { listLlmModels } from "../agent/models";
import { readChatImage } from "../conversations/images";
import { clipOf } from "../conversations/live-turn";
import { getSession, listSessions } from "../conversations/sessions";
import { submitOpening, submitTurn } from "../conversations/turn";
import { getConnections, getSettings, updateConnections, updateSettings } from "../settings/chat";
import { approvalsRouter } from "./agent";
import { bytesOf, json, query } from "./inputs";

const providerParam = z.object({ provider: llmProviderSchema });

/** pi's providers: whether each can be used, and signing in to them (an API key or a sign-in),
 *  which the screen follows until it ends. */
const providersRouter = new Hono()
	.get("/", async (c) => c.json<ProviderStatus[]>(await providerStatus()))
	.post("/:provider/login", json(providerLoginSchema), async (c) => {
		const { provider } = providerParam.parse(c.req.param());
		return c.json<ProviderLogin>(await startProviderLogin(provider, c.req.valid("json").type));
	})
	.delete("/:provider", async (c) => {
		const { provider } = providerParam.parse(c.req.param());
		return c.json<ProviderStatus[]>(await forgetProvider(provider));
	})
	.get("/logins/:id", (c) => c.json<ProviderLogin>(providerLogin(c.req.param("id"))))
	.post("/logins/:id/code", json(loginCodeSchema), (c) =>
		c.json<ProviderLogin>(answerLogin(c.req.param("id"), c.req.valid("json").code)),
	)
	.post("/logins/:id/cancel", (c) => c.json<ProviderLogin>(cancelLogin(c.req.param("id"))));

export const chatRouter = new Hono()
	.get("/settings", (c) => c.json<ChatSettingsView>(getSettings()))
	.patch("/settings", json(chatSettingsPatchSchema), (c) =>
		c.json<ChatSettingsView>(updateSettings(c.req.valid("json"))),
	)
	.route("/providers", providersRouter)
	.get("/llm-models", query(z.object({ provider: llmProviderSchema })), async (c) =>
		c.json(await listLlmModels(c.req.valid("query").provider)),
	)
	.get("/connections", (c) => c.json<ConnectionsView>(getConnections()))
	.patch("/connections", json(connectionsPatchSchema), (c) =>
		c.json<ConnectionsView>(updateConnections(c.req.valid("json"))),
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
