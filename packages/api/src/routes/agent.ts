import {
	type AgentSettingsView,
	agentSettingsPatchSchema,
	approvalSchema,
	composioConnectSchema,
} from "@nextroom/contracts";
import { Hono } from "hono";
import { z } from "zod";
import { resetAffinity } from "../affinity/store";
import { forgetConversation } from "../agent/cleanup";
import { memoryOverview } from "../agent/memory";
import { decide } from "../agent/steps";
import { dockerStatus } from "../agent/tools/sandbox";
import { getCharacter } from "../characters/store";
import { composioCatalog, composioStatus, connectComposioToolkit } from "../composio/client";
import { NotFoundError } from "../lib/errors";
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
	.get("/composio/catalog", async (c) => c.json(await composioCatalog()))
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

const characterQuery = query(z.object({ character_id: z.string() }));

/** What a character remembers (`?character_id=`). */
export const memoryRouter = new Hono()
	.get("/", characterQuery, async (c) => {
		const characterId = c.req.valid("query").character_id;
		getCharacter(characterId);
		return c.json(memoryOverview(characterId));
	})
	.delete("/", characterQuery, async (c) => {
		const characterId = c.req.valid("query").character_id;
		getCharacter(characterId);
		// How close the two are comes from what is remembered, so it starts over with the memory.
		resetAffinity(characterId);
		// The conversation's messages are part of the memory, so the conversation starts over too.
		await forgetConversation(characterId);
		return c.json(memoryOverview(characterId));
	});
