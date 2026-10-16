// A job on the server's queue (a conversation turn), as the screens see it.

export type JobStatus = "queued" | "running" | "done" | "error" | "cancelled";

const ACTIVE_JOB_STATUSES: readonly JobStatus[] = ["queued", "running"];
export const isJobActive = (status: JobStatus) => ACTIVE_JOB_STATUSES.includes(status);

export interface JobView {
	id: string;
	kind: string;
	title: string;
	meta: Record<string, unknown>;
	status: JobStatus;
	progress: number;
	message: string;
	error: string | null;
	created_at: number;
	started_at: number | null;
	finished_at: number | null;
}
