// Errors the API answers with their own status and `{detail}`; anything else is a 500.

import type { z } from "zod";

export class NotFoundError extends Error {
	readonly status = 404 as const;
}

export class BadRequestError extends Error {
	readonly status = 400 as const;
}

export class ConflictError extends Error {
	readonly status = 409 as const;
}

type ApiError = NotFoundError | BadRequestError | ConflictError;

export const isApiError = (error: unknown): error is ApiError =>
	error instanceof NotFoundError ||
	error instanceof BadRequestError ||
	error instanceof ConflictError;

/** `data` checked against `schema`; otherwise a BadRequestError naming the first problem,
 *  after `label` (or else its path). */
export function parseOrBadRequest<T extends z.ZodType>(
	schema: T,
	data: unknown,
	label?: string,
): z.output<T> {
	const parsed = schema.safeParse(data);
	if (parsed.success) return parsed.data;
	const issue = parsed.error.issues[0];
	const what = issue?.message ?? "invalid";
	const where = label ?? issue?.path.join(".");
	throw new BadRequestError(where ? `${where}: ${what}` : what);
}

export const messageOf = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

/** Work given up because it was cancelled: a job, or a GPU call whose signal was aborted. */
export class Cancelled extends Error {
	override name = "Cancelled";
}
