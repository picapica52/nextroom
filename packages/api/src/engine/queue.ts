// The engine's GPU work (synthesis, transcription, voice files, images) runs one job at a
// time, apart from the conversation turns that wait for it.

import { type Job, JobQueue, waitFor } from "../lib/jobs";

export const gpuQueue = new JobQueue();

/** Queue `fn` and wait for its result; aborting `signal` cancels it. */
export function runOnGpu<T>(
	kind: string,
	title: string,
	fn: (job: Job) => Promise<T>,
	signal?: AbortSignal,
): Promise<T> {
	return waitFor<T>(gpuQueue, gpuQueue.submit(kind, title, fn), signal);
}
