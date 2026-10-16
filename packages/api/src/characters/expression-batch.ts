// Generating faces in a batch: a job on its own queue (apart from conversation turns), drawing
// several tags at once and adding each face as soon as it is drawn.

import {
	type ExpressionBatch,
	type ExpressionBatchView,
	expressionTagLabel,
	isJobActive,
} from "@nextroom/contracts";
import { ConflictError, messageOf } from "../lib/errors";
import { type Job, JobQueue } from "../lib/jobs";
import { generateExpression } from "./expression-ai";
import { loadCharacter } from "./store";

export const imageQueue = new JobQueue();

/** How many faces of a batch are drawn at once. */
const CONCURRENCY = 4;

interface Batch {
	job: Job;
	tags: string[];
	done: number;
	error: string | null;
}

/** The latest batch of each character. */
const batches = new Map<string, Batch>();

const active = (batch: Batch | undefined) => batch !== undefined && isJobActive(batch.job.status);

const viewOf = (batch: Batch): ExpressionBatchView => ({
	id: batch.job.id,
	status: batch.job.status,
	tags: batch.tags,
	done: batch.done,
	error: batch.error,
});

export function startExpressionBatch(
	characterId: string,
	{ tags, ...request }: ExpressionBatch,
): ExpressionBatchView {
	loadCharacter(characterId);
	if (active(batches.get(characterId)))
		throw new ConflictError("このキャラクターの表情画像はすでに生成中です");
	const job = imageQueue.submit(
		"expression-batch",
		"表情画像の一括生成",
		async (job) => {
			// One failed face stops the others too.
			const failed = new AbortController();
			const signal = AbortSignal.any([job.signal, failed.signal]);
			const drawing = new Set<(typeof tags)[number]>();
			const report = () =>
				job.update(
					batch.done / tags.length,
					`${[...drawing].map(expressionTagLabel).join("・")} を生成中`,
				);
			let next = 0;
			const worker = async () => {
				while (!signal.aborted) {
					const tag = tags[next++];
					if (tag === undefined) return;
					drawing.add(tag);
					report();
					try {
						await generateExpression(characterId, { ...request, tag }, signal);
						batch.done++;
					} finally {
						drawing.delete(tag);
					}
				}
			};
			try {
				await Promise.all(
					Array.from({ length: Math.min(CONCURRENCY, tags.length) }, () =>
						worker().catch((error) => {
							failed.abort();
							throw error;
						}),
					),
				);
				job.checkCancelled();
			} catch (error) {
				if (!job.cancelled) batch.error = messageOf(error);
				throw error;
			}
		},
		{ character_id: characterId },
	);
	const batch: Batch = { job, tags, done: 0, error: null };
	batches.set(characterId, batch);
	return viewOf(batch);
}

export function expressionBatchOf(characterId: string): ExpressionBatchView | null {
	const batch = batches.get(characterId);
	return batch ? viewOf(batch) : null;
}

/** Stops the batch; the faces being drawn are dropped, the ones already added stay. */
export function cancelExpressionBatch(characterId: string): ExpressionBatchView | null {
	const batch = batches.get(characterId);
	if (batch) imageQueue.cancel(batch.job.id);
	return batch ? viewOf(batch) : null;
}
