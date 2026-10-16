import type { EngineStatus } from "@nextroom/contracts";
import { Hono } from "hono";

import { gpuQueue } from "../engine/queue";
import { speechStatus } from "../engine/speech";
import { queue } from "../lib/jobs";
import { openBrowsers } from "../mastra/tools/browser";

export const systemRouter = new Hono()
	// The speech.cpp server, the GPU job, this app's running turn and the open browsers.
	.get("/status", async (c) => {
		const status: EngineStatus = {
			speech: await speechStatus(),
			browsers: openBrowsers(),
			engine_job: gpuQueue.current?.view() ?? null,
			current_job: queue.current?.view() ?? null,
		};
		return c.json(status);
	});
