import {
	type AgentSettingsView,
	agentSettingsPatchSchema,
	approvalSchema,
	browserInputSchema,
	composioConnectSchema,
} from "@nextroom/contracts";
import { Hono } from "hono";
import { z } from "zod";
import { resetAffinity } from "../affinity/store";
import { getCharacter } from "../characters/store";
import { composioStatus, connectComposioToolkit } from "../composio/client";
import { loadSession } from "../conversations/sessions";
import { NotFoundError } from "../lib/errors";
import { forgetConversation } from "../mastra/cleanup";
import { characterMemory, memoryOverview } from "../mastra/memory";
import { decide } from "../mastra/steps";
import { browserFrame, browserInput, browserView, closeBrowser } from "../mastra/tools/browser";
import { dockerStatus } from "../mastra/tools/sandbox";
import { getAgentSettings, loadAgentSettings, updateAgentSettings } from "../settings/agent";
import { json, ok, query } from "./inputs";

export const agentRouter = new Hono()
	.get("/settings", (c) => c.json<AgentSettingsView>(getAgentSettings()))
	.patch("/settings", json(agentSettingsPatchSchema), (c) =>
		c.json<AgentSettingsView>(updateAgentSettings(c.req.valid("json"))),
	)
	.get("/docker", async (c) => c.json(await dockerStatus()))
	.get("/composio", async (c) =>
		c.json(await composioStatus(loadAgentSettings().composio.toolkits)),
	)
	.post("/composio/:toolkit/connect", json(composioConnectSchema), async (c) => {
		const url = await connectComposioToolkit(
			loadAgentSettings().composio.toolkits,
			c.req.param("toolkit"),
			c.req.valid("json").callback_url,
		);
		return c.json({ url });
	});

/** Answers to the questions a reply asks before a tool runs. */
export const approvalsRouter = new Hono().post(
	"/:id/approvals/:approval",
	json(approvalSchema),
	(c) => {
		const decision = c.req.valid("json");
		if (!decide(c.req.param("id"), c.req.param("approval"), decision)) {
			throw new NotFoundError("この確認はもう終わっています");
		}
		return c.json(ok);
	},
);

/** A conversation's browser: what it shows, and the user's own input into it. */
export const browserRouter = new Hono()
	.get("/:id", async (c) => {
		loadSession(c.req.param("id"));
		return c.json(await browserView(c.req.param("id")));
	})
	.get("/:id/frame", (c) => {
		const frame = browserFrame(c.req.param("id"));
		if (!frame) return c.body(null, 204);
		return c.body(new Uint8Array(frame), 200, {
			"content-type": "image/jpeg",
			"cache-control": "no-store",
		});
	})
	.post("/:id/input", json(browserInputSchema), async (c) => {
		return c.json({ ok: await browserInput(c.req.param("id"), c.req.valid("json")) });
	})
	.post("/:id/close", async (c) => {
		await closeBrowser(c.req.param("id"));
		return c.json(ok);
	});

const characterQuery = query(z.object({ character_id: z.string() }));

/** What a character remembers (`?character_id=`). */
export const memoryRouter = new Hono()
	.get("/", characterQuery, async (c) => {
		const characterId = c.req.valid("query").character_id;
		getCharacter(characterId);
		return c.json(await memoryOverview(characterMemory(), characterId));
	})
	.delete("/", characterQuery, async (c) => {
		const characterId = c.req.valid("query").character_id;
		getCharacter(characterId);
		// How close the two are comes from what is remembered, so it starts over with the memory.
		resetAffinity(characterId);
		// The conversation's messages are the memory's thread, so the conversation starts over too.
		await forgetConversation(characterId);
		return c.json(await memoryOverview(characterMemory(), characterId));
	});
