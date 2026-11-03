import type {
	ConnectionsPatch,
	LlmProvider,
	PiProviderId,
	SubscriptionLogin,
	SubscriptionProvider,
} from "@nextroom/contracts";
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
				qk.openrouterImageModels(),
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

/** Whether the user is signed in to each subscription. */
export function useSubscriptions() {
	return useQuery({
		queryKey: qk.subscriptions(),
		queryFn: ({ signal }) => read(client.chat.subscriptions.$get(undefined, signalled(signal))),
	});
}

/** A sign-in in progress, polled until it ends; signed in, the status and the models are read again. */
export function useSubscriptionLogin(id: string | null) {
	const qc = useQueryClient();
	return useQuery({
		queryKey: qk.subscriptionLogin(id),
		queryFn: async ({ signal }) => {
			const login = await read(
				client.chat.subscriptions.logins[":id"].$get(
					{ param: { id: id ?? "" } },
					signalled(signal),
				),
			);
			if (login.status === "done") {
				qc.invalidateQueries({ queryKey: qk.subscriptions() });
				qc.invalidateQueries({ queryKey: qk.piProviders() });
				qc.invalidateQueries({ queryKey: qk.llmModels(login.provider) });
			}
			return login;
		},
		enabled: !!id,
		refetchInterval: (q) => (q.state.data?.status === "pending" ? POLL.subscriptionLogin : false),
	});
}

/** Starts, answers, cancels a sign-in, or signs out of a subscription. */
export function useSubscriptionActions() {
	const qc = useQueryClient();
	const logins = client.chat.subscriptions.logins[":id"];
	const settle = (login: SubscriptionLogin) =>
		qc.setQueryData(qk.subscriptionLogin(login.id), login);
	return {
		start: useMutation({
			mutationFn: (provider: SubscriptionProvider) =>
				read(client.chat.subscriptions[":provider"].login.$post({ param: { provider } })),
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
		signOut: useMutation({
			mutationFn: (provider: SubscriptionProvider) =>
				read(client.chat.subscriptions[":provider"].$delete({ param: { provider } })),
			onSuccess: (data, provider) => {
				qc.setQueryData(qk.subscriptions(), data);
				qc.invalidateQueries({ queryKey: qk.llmModels(provider) });
			},
		}),
	};
}

/** pi's other providers, and whether each can be used now. */
export function usePiProviders() {
	return useQuery({
		queryKey: qk.piProviders(),
		queryFn: ({ signal }) => read(client.chat["pi-providers"].$get(undefined, signalled(signal))),
		staleTime: 60_000,
	});
}

/** Starts signing in to one of pi's other providers (followed with useSubscriptionLogin), or
 *  removes what was entered for it. */
export function usePiProviderActions() {
	const qc = useQueryClient();
	const provider = client.chat["pi-providers"][":provider"];
	return {
		start: useMutation({
			mutationFn: ({ id, type }: { id: PiProviderId; type: "api_key" | "oauth" }) =>
				read(provider.login.$post({ param: { provider: id }, json: { type } })),
			onSuccess: (login) => qc.setQueryData(qk.subscriptionLogin(login.id), login),
		}),
		forget: useMutation({
			mutationFn: (id: PiProviderId) => read(provider.$delete({ param: { provider: id } })),
			onSuccess: (data, id) => {
				qc.setQueryData(qk.piProviders(), data);
				qc.invalidateQueries({ queryKey: qk.llmModels(id) });
			},
		}),
	};
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
