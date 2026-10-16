import type { Context, Env, MiddlewareHandler } from "hono";
import type { z } from "zod";

import { BadRequestError, NotFoundError, parseOrBadRequest } from "../lib/errors";

/** The JSON body, checked against `schema`; an empty body reads as `{}`. */
async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
	const text = await c.req.text();
	let raw: unknown = {};
	if (text.trim()) {
		try {
			raw = JSON.parse(text);
		} catch {
			throw new BadRequestError("body: JSON を読み取れません");
		}
	}
	return parseOrBadRequest(schema, raw ?? {});
}

type Validated<
	K extends "json" | "query",
	T extends z.ZodType,
	E extends Env,
	P extends string,
> = MiddlewareHandler<E, P, { in: { [_ in K]: z.input<T> }; out: { [_ in K]: z.output<T> } }>;

/** The JSON body checked against `schema`, as `c.req.valid("json")`; an empty body reads as `{}`. */
export const json =
	<T extends z.ZodType, E extends Env = Env, P extends string = string>(
		schema: T,
	): Validated<"json", T, E, P> =>
	async (c, next) => {
		c.req.addValidatedData("json", (await body(c, schema)) as object);
		await next();
	};

/** The query string checked against `schema`, as `c.req.valid("query")`. */
export const query =
	<T extends z.ZodType, E extends Env = Env, P extends string = string>(
		schema: T,
	): Validated<"query", T, E, P> =>
	async (c, next) => {
		c.req.addValidatedData("query", parseOrBadRequest(schema, c.req.query()) as object);
		await next();
	};

/** A file on disk, never cached by the browser. */
export async function sendFile(path: string): Promise<Response> {
	const file = Bun.file(path);
	if (!(await file.exists())) throw new NotFoundError("ファイルがありません");
	return new Response(file, { headers: { "cache-control": "no-cache" } });
}

export const bytesOf = async (file: File) => new Uint8Array(await file.arrayBuffer());

export const ok = { ok: true } as const;

/** The content-disposition of a download saved as `filename`. */
export const attachment = (filename: string) =>
	`attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
