// The engine's side: its GPU job queue and the shared audio player.
// Conversation turns run on the server's queue instead (useStatus).

import { isJobActive, type JobView } from "@nextroom/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { client, read, signalled } from "@/lib/api";
import { POLL } from "@/lib/constants";
import { qk } from "@/lib/query-keys";

export function useEngineJobs() {
	return useQuery({
		queryKey: qk.engineJobs(),
		queryFn: ({ signal }) => read(client.engine.jobs.$get(undefined, signalled(signal))),
		refetchInterval: POLL.engineJobs,
	});
}

/** Refresh the job list, e.g. right after queueing a job. */
export function useInvalidateEngineJobs() {
	const qc = useQueryClient();
	return () => qc.invalidateQueries({ queryKey: qk.engineJobs() });
}

/** The newest queued/running engine job matching a predicate, plus its last finished one. */
export function useActiveJob(match: (job: JobView) => boolean) {
	const jobs = useEngineJobs().data ?? [];
	const related = jobs.filter(match);
	const active = related.find((j) => isJobActive(j.status)) ?? null;
	const latest = related[0] ?? null;
	return { active, latest };
}

/** Invalidate the given queries whenever a matching engine job finishes. */
export function useRefreshOnJobFinish(
	match: (job: JobView) => boolean,
	keys: readonly (readonly unknown[])[],
) {
	const qc = useQueryClient();
	const jobs = useEngineJobs().data;
	const seen = useRef<Map<string, string>>(new Map());
	useEffect(() => {
		if (!jobs) return;
		let changed = false;
		for (const job of jobs) {
			if (!match(job)) continue;
			const prev = seen.current.get(job.id);
			if (prev && prev !== job.status) changed = true;
			seen.current.set(job.id, job.status);
		}
		if (changed) for (const key of keys) void qc.invalidateQueries({ queryKey: key });
	});
}

export function useCancelEngineJob() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => read(client.engine.jobs[":id"].cancel.$post({ param: { id } })),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: qk.engineJobs() });
			void qc.invalidateQueries({ queryKey: qk.status() });
		},
	});
}

// ---------------------------------------------------------------- audio player

type PlayerState = { url: string | null; playing: boolean };
let playerState: PlayerState = { url: null, playing: false };
const listeners = new Set<() => void>();
let audioEl: HTMLAudioElement | null = null;

function emit(next: PlayerState) {
	playerState = next;
	for (const listener of listeners) listener();
}

function audio(): HTMLAudioElement {
	if (!audioEl) {
		audioEl = new Audio();
		audioEl.addEventListener("ended", () => emit({ ...playerState, playing: false }));
		audioEl.addEventListener("pause", () => emit({ ...playerState, playing: false }));
		audioEl.addEventListener("play", () => emit({ ...playerState, playing: true }));
	}
	return audioEl;
}

/** One audio element for the whole app: playing a clip stops whatever else was playing. */
export function usePlayer() {
	const state = useSyncExternalStore(
		(cb) => {
			listeners.add(cb);
			return () => listeners.delete(cb);
		},
		() => playerState,
	);
	const toggle = useCallback((url: string) => {
		const el = audio();
		if (playerState.url === url && playerState.playing) {
			el.pause();
			return;
		}
		if (playerState.url !== url) {
			el.src = url;
			emit({ url, playing: false });
		}
		void el.play().catch(() => emit({ url, playing: false }));
	}, []);
	const isPlaying = useCallback((url: string) => state.url === url && state.playing, [state]);
	return { toggle, isPlaying };
}
