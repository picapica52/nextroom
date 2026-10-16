import type { CharacterVoiceRefs, JobView } from "@nextroom/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	useActiveJob,
	useCancelEngineJob,
	useInvalidateEngineJobs,
	useRefreshOnJobFinish,
} from "@/hooks/engine";
import { client, read, signalled } from "@/lib/api";
import { qk } from "@/lib/query-keys";

const isRefJob = (characterId: string) => (j: JobView) =>
	(j.kind === "ref_voice_file" || j.kind === "ref_transcribe") &&
	j.meta.character_id === characterId;

/** A character's reference clips and voice file, fresh again when its jobs finish. */
export function useVoiceRefs(characterId: string) {
	useRefreshOnJobFinish(isRefJob(characterId), [qk.voiceRefs(characterId)]);
	return useQuery({
		queryKey: qk.voiceRefs(characterId),
		queryFn: ({ signal }): Promise<CharacterVoiceRefs> =>
			read(
				client.characters[":id"].voice.refs.$get({ param: { id: characterId } }, signalled(signal)),
			),
	});
}

/** Shows the clips and voice file the server answered with. */
export function useVoiceRefsChanged(characterId: string) {
	const qc = useQueryClient();
	return (data: CharacterVoiceRefs) => qc.setQueryData(qk.voiceRefs(characterId), data);
}

/** The character's engine job of `kind`: the one queued or running, why the latest one failed
 *  (after `failure`), and starting one (with `request`) or cancelling it. */
export function useVoiceRefJob<T = void>(
	characterId: string,
	kind: "ref_voice_file" | "ref_transcribe",
	request: (body: T) => Promise<unknown>,
	failure: string,
) {
	const invalidateJobs = useInvalidateEngineJobs();
	const cancel = useCancelEngineJob();
	const { active, latest } = useActiveJob(
		(j) => j.kind === kind && j.meta.character_id === characterId,
	);
	const start = useMutation({ mutationFn: request, onSuccess: invalidateJobs });
	const failed = !active && latest?.status === "error" ? `${failure}: ${latest.error}` : null;
	return { active, failed, start, cancel };
}
