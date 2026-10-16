import type { LlmProvider } from "@nextroom/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client, read, signalled } from "@/lib/api";
import { POLL } from "@/lib/constants";
import { qk } from "@/lib/query-keys";

export function useStatus() {
	return useQuery({
		queryKey: qk.status(),
		queryFn: ({ signal }) => read(client.status.$get(undefined, signalled(signal))),
		refetchInterval: POLL.status,
	});
}

export function useChatSettings() {
	return useQuery({
		queryKey: qk.chatSettings(),
		queryFn: ({ signal }) => read(client.chat.settings.$get(undefined, signalled(signal))),
	});
}

/** The models the provider's endpoint lists, with the saved key and address. */
export function useLlmModels(provider: LlmProvider) {
	return useQuery({
		queryKey: qk.llmModels(provider),
		queryFn: ({ signal }) =>
			read(client.chat["llm-models"].$get({ query: { provider } }, signalled(signal))),
		retry: false,
		staleTime: 5 * 60_000,
	});
}

/** OpenRouter's models that take an image and give `output`: a drawn image or a Decisions answer. */
export function useOpenrouterImageModels(output: "image" | "decisions") {
	return useQuery({
		queryKey: qk.openrouterImageModels(output),
		queryFn: ({ signal }) =>
			read(client.chat["openrouter-image-models"].$get({ query: { output } }, signalled(signal))),
		retry: false,
		staleTime: 5 * 60_000,
	});
}

/** The ElevenLabs account's voices; only asked for when `enabled` (a key is set). */
export function useElevenlabsVoices(enabled = true) {
	return useQuery({
		queryKey: qk.elevenlabsVoices(),
		queryFn: ({ signal }) => read(client.elevenlabs.voices.$get(undefined, signalled(signal))),
		enabled,
		staleTime: 60_000,
	});
}

/** The speech.cpp server's models the app offers, polled while one loads. */
export function useSpeechModels() {
	return useQuery({
		queryKey: qk.speechModels(),
		queryFn: ({ signal }) =>
			read(client.engine["speech-models"].$get(undefined, signalled(signal))),
		refetchInterval: (q) =>
			q.state.data?.models.some((m) => m.loading) ? POLL.download : POLL.speechModels,
	});
}

/** Has the server fetch and load a model, or stops its fetch. */
export function useSpeechModelAction(name: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (kind: "load" | "cancel") => {
			const model = client.engine["speech-models"][":name"];
			const param = { name };
			return read(kind === "load" ? model.load.$post({ param }) : model.cancel.$post({ param }));
		},
		onSuccess: (data) => {
			qc.setQueryData(qk.speechModels(), data);
			qc.invalidateQueries({ queryKey: qk.status() });
		},
	});
}
