import type { ConnectionsPatch, LlmProvider, ProviderLogin } from "@nextroom/contracts";
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

/** The services' keys (whether each is set, and where from) and addresses. */
export function useConnections() {
	return useQuery({
		queryKey: qk.connections(),
		queryFn: ({ signal }) => read(client.chat.connections.$get(undefined, signalled(signal))),
	});
}

/** Saves keys or addresses; what lists or checks with them is read again. */
export function useSaveConnections() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (patch: ConnectionsPatch) => read(client.chat.connections.$patch({ json: patch })),
		onSuccess: (data) => {
			qc.setQueryData(qk.connections(), data);
			for (const queryKey of [
				qk.llmModels(),
				qk.agentSettings(),
				qk.composio(),
				qk.elevenlabsVoices(),
				qk.fishAudioVoices(),
				qk.speechModels(),
				qk.status(),
			])
				qc.invalidateQueries({ queryKey });
		},
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

/** pi's providers, and whether each can be used now. */
export function useProviders() {
	return useQuery({
		queryKey: qk.providers(),
		queryFn: ({ signal }) => read(client.chat.providers.$get(undefined, signalled(signal))),
		staleTime: 60_000,
	});
}

/** A sign-in in progress, polled until it ends; signed in, the providers and the models are read
 *  again. */
export function useProviderLogin(id: string | null) {
	const qc = useQueryClient();
	return useQuery({
		queryKey: qk.providerLogin(id),
		queryFn: async ({ signal }) => {
			const login = await read(
				client.chat.providers.logins[":id"].$get({ param: { id: id ?? "" } }, signalled(signal)),
			);
			if (login.status === "done") {
				qc.invalidateQueries({ queryKey: qk.providers() });
				qc.invalidateQueries({ queryKey: qk.llmModels(login.provider) });
			}
			return login;
		},
		enabled: !!id,
		refetchInterval: (q) => (q.state.data?.status === "pending" ? POLL.providerLogin : false),
	});
}

/** Starts, answers or cancels signing in to a provider (with a key or a sign-in), or removes what
 *  was entered for it. */
export function useProviderActions() {
	const qc = useQueryClient();
	const provider = client.chat.providers[":provider"];
	const logins = client.chat.providers.logins[":id"];
	const settle = (login: ProviderLogin) => qc.setQueryData(qk.providerLogin(login.id), login);
	return {
		start: useMutation({
			mutationFn: ({ id, type }: { id: LlmProvider; type: "api_key" | "oauth" }) =>
				read(provider.login.$post({ param: { provider: id }, json: { type } })),
			onSuccess: settle,
		}),
		answer: useMutation({
			mutationFn: ({ id, code }: { id: string; code: string }) =>
				read(logins.code.$post({ param: { id }, json: { code } })),
			onSuccess: settle,
		}),
		cancel: useMutation({
			mutationFn: (id: string) => read(logins.cancel.$post({ param: { id } })),
			onSuccess: settle,
		}),
		forget: useMutation({
			mutationFn: (id: LlmProvider) => read(provider.$delete({ param: { provider: id } })),
			onSuccess: (data, id) => {
				qc.setQueryData(qk.providers(), data);
				qc.invalidateQueries({ queryKey: qk.llmModels(id) });
			},
		}),
	};
}

/** The Fish Audio account's own voices; only asked for when `enabled` (a key is set). */
export function useFishAudioVoices(enabled = true) {
	return useQuery({
		queryKey: qk.fishAudioVoices(),
		queryFn: ({ signal }) => read(client["fish-audio"].voices.$get(undefined, signalled(signal))),
		enabled,
		staleTime: 60_000,
	});
}

/** Voices shared on Fish Audio whose title has `title`; asked for only once something is typed. */
export function useFishAudioSearch(title: string) {
	return useQuery({
		queryKey: qk.fishAudioSearch(title),
		queryFn: ({ signal }) =>
			read(client["fish-audio"].voices.search.$get({ query: { title } }, signalled(signal))),
		enabled: title.trim().length > 0,
		staleTime: 5 * 60_000,
	});
}

/** One Fish Audio voice by its id, such as a shared one chosen before. */
export function useFishAudioVoice(id: string, enabled = true) {
	return useQuery({
		queryKey: qk.fishAudioVoice(id),
		queryFn: ({ signal }) =>
			read(client["fish-audio"].voices[":id"].$get({ param: { id } }, signalled(signal))),
		enabled: enabled && Boolean(id),
		staleTime: 5 * 60_000,
		retry: false,
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
