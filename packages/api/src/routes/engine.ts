import type { JobView } from "@nextroom/contracts";
import { Hono } from "hono";

import { imageQueue } from "../characters/expression-batch";
import { gpuQueue } from "../engine/queue";
import { speechLoads, speechModels } from "../engine/speech-models";
import { deleteUpload, newUpload, saveUploadFiles } from "../engine/uploads";
import { NotFoundError } from "../lib/errors";
import { queue } from "../lib/jobs";
import { ok } from "./inputs";

/** The queue holding job `id`: the conversation turns', the face batches' or the GPU's. */
const queueOf = (id: string) => [queue, imageQueue].find((q) => q.get(id)) ?? gpuQueue;

/** `/api/engine/*`: the speech.cpp server's models, the job queues and uploads. */
export const engineRouter = new Hono()
	.get("/speech-models", async (c) => c.json(await speechModels()))
	.post("/speech-models/:name/load", async (c) => {
		speechLoads.start(c.req.param("name"));
		return c.json(await speechModels());
	})
	.post("/speech-models/:name/cancel", async (c) => {
		speechLoads.cancel(c.req.param("name"));
		return c.json(await speechModels());
	})
	.get("/jobs", (c) => c.json<JobView[]>(gpuQueue.list().map((job) => job.view())))
	.get("/jobs/:id", (c) => {
		const id = c.req.param("id");
		const job = queueOf(id).get(id);
		if (!job) throw new NotFoundError("ジョブが見つかりません");
		return c.json(job.view());
	})
	.post("/jobs/:id/cancel", (c) => {
		const id = c.req.param("id");
		return c.json({ cancelled: queueOf(id).cancel(id) });
	})
	.post("/uploads", (c) => c.json({ upload_id: newUpload() }))
	.post("/uploads/:id/files", async (c) => {
		const form = await c.req.formData();
		const files = form.getAll("files").filter((f): f is File => f instanceof File);
		const paths = form.getAll("paths").map(String);
		return c.json(await saveUploadFiles(c.req.param("id"), files, paths));
	})
	.delete("/uploads/:id", (c) => {
		deleteUpload(c.req.param("id"));
		return c.json(ok);
	});
