// The server's API: `client` is typed by the server's routes; `api` sends the uploads, whose
// forms the routes do not type.

import type { AppType } from "@nextroom/api";
import type { ElevenlabsTtsModel, TtsProvider } from "@nextroom/contracts";
import { type ClientResponse, hc } from "hono/client";

/** The avatar URL, changing whenever the character is saved so the browser does not show a stale one. */
export const avatarUrl = (c: { id: string; has_avatar: boolean; updated_at: number }) =>
	c.has_avatar ? `/api/characters/${c.id}/avatar?v=${c.updated_at}` : null;

/** The image faces are generated from, changing whenever the character is saved. */
export const referenceUrl = (c: { id: string; has_reference: boolean; updated_at: number }) =>
	c.has_reference ? `/api/characters/${c.id}/reference?v=${c.updated_at}` : null;

/** A face's URL; a cut-out face is a different URL, so the browser does not show the original. */
export const expressionUrl = (characterId: string, e: { id: string; cutout: boolean }) =>
	`/api/characters/${characterId}/expressions/${e.id}${e.cutout ? "?cutout" : ""}`;

/** An image of a conversation: one the user attached, or one the character drew. */
export const chatImageUrl = (sessionId: string, imageId: string) =>
	`/api/chat/sessions/${sessionId}/images/${imageId}`;

export class ApiError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A form with one file under "file", for the upload endpoints. */
export function fileForm(file: File) {
	const form = new FormData();
	form.append("file", file, file.name);
	return form;
}

/** Throws an ApiError with the server's detail when `res` is not ok. */
async function ensureOk(res: Pick<Response, "ok" | "status" | "statusText" | "json">) {
	if (res.ok) return;
	let detail = `${res.status} ${res.statusText}`;
	try {
		const data = await res.json();
		if (data?.detail)
			detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
	} catch {
		/* not json */
	}
	throw new ApiError(detail, res.status);
}

/** The server's routes under `/api`, with their paths, requests and answers typed. */
export const client = hc<AppType>("/api");

/** Request options passing `signal` on to fetch. */
export const signalled = (signal?: AbortSignal) => ({ init: { signal } });

type JsonResponse = ClientResponse<unknown, number, "json">;

/** The JSON a `client` call answers, throwing an ApiError when it is not ok. */
export async function read<R extends JsonResponse>(
	request: Promise<R>,
): Promise<Awaited<ReturnType<R["json"]>>> {
	const res = await request;
	await ensureOk(res);
	return (await res.json()) as Awaited<ReturnType<R["json"]>>;
}

/** A `client` call's response itself, for reading its headers or body another way; throws
 *  an ApiError when it is not ok. */
export async function respond<R extends ClientResponse<unknown>>(request: Promise<R>): Promise<R> {
	const res = await request;
	await ensureOk(res);
	return res;
}

/** Sends `form` to `url` and reads the JSON it answers, throwing an ApiError when it is not ok. */
async function sendForm<T>(method: "POST" | "PUT", url: string, form: FormData): Promise<T> {
	const res = await fetch(url, { method, body: form });
	await ensureOk(res);
	return res.json() as Promise<T>;
}

/** Uploads (forms with files), which `client` does not type. */
export const api = {
	post: <T>(url: string, form: FormData) => sendForm<T>("POST", url, form),
	put: <T>(url: string, form: FormData) => sendForm<T>("PUT", url, form),
};

export const ELEVENLABS_TTS_MODEL_LABELS: Record<ElevenlabsTtsModel, string> = {
	eleven_v4: "Eleven v4",
	eleven_v4_turbo: "Eleven v4 Turbo（低遅延）",
	eleven_v3: "Eleven v3",
	eleven_multilingual_v2: "Multilingual v2",
	eleven_flash_v2_5: "Flash v2.5（低遅延）",
};

/** What an ElevenLabs voice is, by its category. */
export const elevenlabsCategoryLabel = (category: string) =>
	({ premade: "既定", cloned: "複製", generated: "デザイン", professional: "プロ" })[category] ??
	category;

/** What speaks a character, in short. */
export const voiceLabel = (provider: TtsProvider) =>
	({ irodori: "Irodori-TTS", elevenlabs: "ElevenLabs" })[provider];

export function formatBytes(n: number | null | undefined): string {
	if (!n) return "—";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let i = 0;
	let v = n;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatSeconds(sec: number | null | undefined): string {
	if (sec == null) return "—";
	const s = Math.round(sec);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const r = s % 60;
	if (h > 0) return `${h}時間${String(m).padStart(2, "0")}分`;
	return `${m}分${String(r).padStart(2, "0")}秒`;
}

export function formatClock(sec: number | null | undefined): string {
	if (sec == null) return "—";
	const m = Math.floor(sec / 60);
	const s = sec - m * 60;
	return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

/** "今日 13:05" for today, "10/2 13:05" otherwise. Input is a Unix time in seconds. */
export function formatDate(ts: number | null | undefined): string {
	if (!ts) return "—";
	const d = new Date(ts * 1000);
	const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
	const now = new Date();
	if (d.toDateString() === now.toDateString()) return `今日 ${hm}`;
	return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
