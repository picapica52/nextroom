import type { LlmProvider, SubscriptionLogin, SubscriptionProvider } from "@nextroom/contracts";
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
