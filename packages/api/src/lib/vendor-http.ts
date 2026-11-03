// The HTTP client of the speech services (ElevenLabs, Fish Audio).

import { encodeWav } from "../engine/wav";
import { Cancelled, ConflictError } from "./errors";

/** The rate of the PCM the services speak in. */
export const PCM_RATE = 24000;

/** Requests to a service: a failed one is a ConflictError, an aborted one Cancelled. */
export function vendorClient(service: {
	name: string;
	baseUrl: string;
	/** The header with the API key (throws when there is none). */
	auth: () => [string, string];
	/** The message in an error answer. */
	detailOf: (answer: unknown) => string | null;
}) {
	async function request(path: string, init: RequestInit = {}): Promise<Response> {
		const headers = new Headers(init.headers);
		headers.set(...service.auth());
		let response: Response;
		try {
			response = await fetch(service.baseUrl + path, { ...init, headers });
		} catch (error) {
			if (init.signal?.aborted) throw new Cancelled();
			throw new ConflictError(`${service.name} に接続できません: ${(error as Error).message}`);
		}
		if (!response.ok) {
			const detail = service.detailOf(await response.json().catch(() => null));
			throw new ConflictError(
				`${service.name}: ${detail ?? `${response.status} ${response.statusText}`}`,
			);
		}
		return response;
	}
	const requestJson = async <T>(path: string, init: RequestInit = {}): Promise<T> =>
		(await request(path, init)).json() as Promise<T>;
	return { request, requestJson };
}

/** `speed` within what the service takes; 1 when it is not a number. */
export const clampSpeed = (speed: number, range: { min: number; max: number }) =>
	Math.min(Math.max(Number(speed) || 1, range.min), range.max);

/** 16-bit PCM at PCM_RATE as speech: a WAV and its length. */
export async function speechOf(response: Response, seed: number) {
	const pcm = new Uint8Array(await response.arrayBuffer());
	return { audio: encodeWav([pcm], PCM_RATE), duration: pcm.length / 2 / PCM_RATE, seed };
}
