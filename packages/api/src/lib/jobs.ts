// Single-worker job queues: conversation turns run one at a time, and so does the engine's GPU
// work (engine/queue.ts).

import { isJobActive, type JobStatus, type JobView } from "@nextroom/contracts";

import { Cancelled, messageOf } from "./errors";
import { newId, now } from "./storage";

/** Finished jobs are forgotten after this long, and beyond this many. */
const KEEP_FINISHED_S = 60 * 60;
const MAX_FINISHED = 100;

export class Job {
	status: JobStatus = "queued";
	progress = 0;
	message = "";
	result: unknown = null;
	/** What the job threw. */
	failure: unknown = null;
	readonly createdAt = now();
	startedAt: number | null = null;
	finishedAt: number | null = null;
	private readonly controller = new AbortController();
	private settle: () => void = () => {};
	/** Resolves once the job is done, failed or cancelled. */
	readonly finished = new Promise<void>((resolve) => {
		this.settle = resolve;
	});

	constructor(
		readonly id: string,
		readonly kind: string,
		readonly title: string,
		readonly meta: Record<string, unknown>,
		public fn: ((job: Job) => Promise<unknown>) | null,
	) {}

	/** Aborted when the job is cancelled; passed to whatever the job waits on. */
	get signal(): AbortSignal {
		return this.controller.signal;
	}

	get cancelled(): boolean {
		return this.controller.signal.aborted;
	}

	cancel(): void {
		this.controller.abort();
	}

	/** Marks the job finished as it now stands. */
	finish(): void {
		this.finishedAt = now();
		this.settle();
	}

	update(progress?: number | null, message?: string | null): void {
		if (progress != null) this.progress = Math.max(0, Math.min(1, progress));
		if (message != null) this.message = message;
	}

	checkCancelled(): void {
		if (this.cancelled) throw new Cancelled();
	}

	get error(): string | null {
		const e = this.failure;
		return this.status === "error"
			? `${e instanceof Error ? e.name : "Error"}: ${messageOf(e)}`
			: null;
	}

	view(): JobView {
		return {
			id: this.id,
			kind: this.kind,
			title: this.title,
			meta: this.meta,
			status: this.status,
			progress: this.progress,
			message: this.message,
			error: this.error,
			created_at: this.createdAt,
			started_at: this.startedAt,
			finished_at: this.finishedAt,
		};
	}
}

export class JobQueue {
	private readonly jobs = new Map<string, Job>();
	private readonly pending: string[] = [];
	private running: Job | null = null;
	private wake: (() => void) | null = null;

	constructor() {
		void this.work();
	}

	submit(
		kind: string,
		title: string,
		fn: (job: Job) => Promise<unknown>,
		meta: Record<string, unknown> = {},
	): Job {
		const job = new Job(newId("job_"), kind, title, meta, fn);
		this.jobs.set(job.id, job);
		this.pending.push(job.id);
		this.wake?.();
		return job;
	}

	get(jobId: string): Job | undefined {
		return this.jobs.get(jobId);
	}

	list(limit = 50): Job[] {
		return [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
	}

	/** A queued or running job of `kind`. */
	findActive(kind: string): Job | undefined {
		return [...this.jobs.values()].find((job) => job.kind === kind && isJobActive(job.status));
	}

	cancel(jobId: string): boolean {
		const job = this.jobs.get(jobId);
		if (!job || !isJobActive(job.status)) return false;
		job.cancel();
		if (job.status === "queued") {
			const index = this.pending.indexOf(jobId);
			if (index >= 0) this.pending.splice(index, 1);
			job.status = "cancelled";
			job.fn = null;
			job.finish();
			this.prune();
		}
		return true;
	}

	get current(): Job | null {
		return this.running;
	}

	private async work(): Promise<void> {
		for (;;) {
			const id = this.pending.shift();
			if (id === undefined) {
				await new Promise<void>((resolve) => {
					this.wake = resolve;
				});
				this.wake = null;
				continue;
			}
			const job = this.jobs.get(id);
			if (!job) continue;
			this.running = job;
			job.status = "running";
			job.startedAt = now();
			try {
				job.result = await job.fn?.(job);
				job.status = job.cancelled ? "cancelled" : "done";
				if (job.status === "done") job.progress = 1;
			} catch (error) {
				if (error instanceof Cancelled || job.cancelled) {
					job.status = "cancelled";
				} else {
					job.status = "error";
					job.failure = error;
				}
			} finally {
				this.running = null;
				job.fn = null;
				job.finish();
				this.prune();
			}
		}
	}

	/** Drops finished jobs past their keep time or beyond the newest MAX_FINISHED. */
	private prune(): void {
		const finished = [...this.jobs.values()]
			.filter((job) => job.finishedAt !== null)
			.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
		const cutoff = now() - KEEP_FINISHED_S;
		for (const [i, job] of finished.entries()) {
			if (i >= MAX_FINISHED || (job.finishedAt ?? 0) < cutoff) this.jobs.delete(job.id);
		}
	}
}

/** `job`'s result once it has run; aborting `signal` cancels it. A cancelled job throws
 *  Cancelled, and a failed one what it threw. */
export async function waitFor<T>(queue: JobQueue, job: Job, signal?: AbortSignal): Promise<T> {
	const cancel = () => queue.cancel(job.id);
	signal?.addEventListener("abort", cancel, { once: true });
	if (signal?.aborted) cancel();
	try {
		await job.finished;
	} finally {
		signal?.removeEventListener("abort", cancel);
	}
	if (job.status === "cancelled") throw new Cancelled();
	if (job.status === "error") throw job.failure;
	return job.result as T;
}

export const queue = new JobQueue();
