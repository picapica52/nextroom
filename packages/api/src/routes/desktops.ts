import type { DesktopView } from "@nextroom/contracts";
import { Hono } from "hono";
import { desktopPage, desktopView, ensureDesktop, stopDesktop } from "../agent/tools/desktop";
import { getCharacter } from "../characters/store";
import { BadRequestError } from "../lib/errors";
import { loadAgentSettings } from "../settings/agent";

/** A character's desktop: its state, starting and stopping it, and the page that shows it (its
 *  websocket is taken before the routes, by upgradeDesktopSocket). */
export const desktopsRouter = new Hono()
	.get("/:id", async (c) => {
		getCharacter(c.req.param("id"));
		return c.json<DesktopView>(await desktopView(c.req.param("id"), loadAgentSettings()));
	})
	.post("/:id/start", async (c) => {
		const id = c.req.param("id");
		getCharacter(id);
		const settings = loadAgentSettings();
		if (!settings.desktop.enabled)
			throw new BadRequestError("デスクトップは設定でオフになっています");
		// Making the image the first time takes minutes; the screen polls the state meanwhile.
		void ensureDesktop(id, settings.desktop).catch(() => {});
		return c.json<DesktopView>(await desktopView(id, settings));
	})
	.post("/:id/stop", async (c) => {
		const id = c.req.param("id");
		getCharacter(id);
		await stopDesktop(id);
		return c.json<DesktopView>(await desktopView(id, loadAgentSettings()));
	})
	.get("/:id/vnc/*", (c) => {
		const prefix = `/vnc/`;
		const path = c.req.path.slice(c.req.path.indexOf(prefix) + prefix.length);
		return desktopPage(c.req.param("id"), path);
	});
