import {
	type ChatSettingsView,
	type ChatTurn,
	type ConnectionsView,
	chatSettingsPatchSchema,
	connectionsPatchSchema,
	llmProviderSchema,
	type PiProviderStatus,
	piLoginSchema,
	piProviderIdSchema,
	SUBSCRIPTION_PROVIDERS,
	type SubscriptionLogin,
	type SubscriptionStatus,
	subscriptionCodeSchema,
} from "@nextroom/contracts";
import { Hono } from "hono";
import { z } from "zod";
import {
	answerSubscriptionLogin,
	cancelSubscriptionLogin,
	forgetPiProvider,
	piProviderStatus,
	signOut,
	startPiLogin,
	startSubscriptionLogin,
	subscriptionLogin,
	subscriptionStatus,
} from "../agent/auth";
import { listLlmModels } from "../agent/models";
import { readChatImage } from "../conversations/images";
import { clipOf } from "../conversations/live-turn";
import { getSession, listSessions } from "../conversations/sessions";
import { submitOpening, submitTurn } from "../conversations/turn";
import { getConnections, getSettings, updateConnections, updateSettings } from "../settings/chat";
import { approvalsRouter } from "./agent";
import { bytesOf, json, query } from "./inputs";

const subscriptionParam = z.object({ provider: z.enum(SUBSCRIPTION_PROVIDERS) });

/** Signing in to the subscriptions the replies can use. */
const subscriptionsRouter = new Hono()
	.get("/", (c) => c.json<SubscriptionStatus[]>(subscriptionStatus()))
	.post("/:provider/login", async (c) => {
		const { provider } = subscriptionParam.parse(c.req.param());
		return c.json<SubscriptionLogin>(await startSubscriptionLogin(provider));
	})
	.delete("/:provider", async (c) => {
		const { provider } = subscriptionParam.parse(c.req.param());
		await signOut(provider);
		return c.json<SubscriptionStatus[]>(subscriptionStatus());
	})
	.get("/logins/:id", (c) => c.json<SubscriptionLogin>(subscriptionLogin(c.req.param("id"))))
	.post("/logins/:id/code", json(subscriptionCodeSchema), (c) =>
		c.json<SubscriptionLogin>(answerSubscriptionLogin(c.req.param("id"), c.req.valid("json").code)),
	)
	.post("/logins/:id/cancel", (c) =>
		c.json<SubscriptionLogin>(cancelSubscriptionLogin(c.req.param("id"))),
	);

const piProviderParam = z.object({ provider: piProviderIdSchema });

/** pi's other providers: signing in to them (the sign-in is followed like a subscription's). */
const piProvidersRouter = new Hono()
	.get("/", async (c) => c.json<PiProviderStatus[]>(await piProviderStatus()))
	.post("/:provider/login", json(piLoginSchema), async (c) => {
		const { provider } = piProviderParam.parse(c.req.param());
		return c.json<SubscriptionLogin>(await startPiLogin(provider, c.req.valid("json").type));
	})
	.delete("/:provider", async (c) => {
		const { provider } = piProviderParam.parse(c.req.param());
		return c.json<PiProviderStatus[]>(await forgetPiProvider(provider));
	});

export const chatRouter = new Hono()
	.get("/settings", (c) => c.json<ChatSettingsView>(getSettings()))
	.patch("/settings", json(chatSettingsPatchSchema), (c) =>
		c.json<ChatSettingsView>(updateSettings(c.req.valid("json"))),
	)
	.route("/subscriptions", subscriptionsRouter)
	.route("/pi-providers", piProvidersRouter)
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
