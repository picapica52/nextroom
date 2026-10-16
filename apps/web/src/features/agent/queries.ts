import type { AgentSettingsPatch, AgentSettingsView, MemoryOverview } from "@nextroom/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client, read, signalled } from "@/lib/api";
import { qk } from "@/lib/query-keys";

export function useAgentSettings() {
	return useQuery({
		queryKey: qk.agentSettings(),
		queryFn: ({ signal }) => read(client.agent.settings.$get(undefined, signalled(signal))),
	});
}

export function useSaveAgentSettings() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (patch: AgentSettingsPatch) => read(client.agent.settings.$patch({ json: patch })),
		onSuccess: (data) =>
			qc.setQueryData<AgentSettingsView>(qk.agentSettings(), (old) => old && { ...old, ...data }),
	});
}

export function useDockerStatus(opts: { enabled?: boolean; refetchInterval?: number } = {}) {
	return useQuery({
		queryKey: qk.docker(),
		queryFn: ({ signal }) => read(client.agent.docker.$get(undefined, signalled(signal))),
		...opts,
	});
}

/** The apps the settings name, and whether an account is connected to each. */
export function useComposioStatus(enabled: boolean) {
	return useQuery({
		queryKey: qk.composio(),
		queryFn: ({ signal }) => read(client.agent.composio.$get(undefined, signalled(signal))),
		enabled,
		// Back from the sign-in page, the tab gets focus again; the connection shows then.
		refetchOnWindowFocus: true,
	});
}

/** Opens the sign-in page that connects an account to `toolkit`, which brings the user back here. */
export function useConnectComposio() {
	return useMutation({
		mutationFn: (toolkit: string) =>
			read(
				client.agent.composio[":toolkit"].connect.$post({
					param: { toolkit },
					json: { callback_url: window.location.href },
				}),
			),
		onSuccess: ({ url }) => window.location.assign(url),
	});
}

/** Answer a reply's question before a tool runs. */
export function useApprove(sessionId: string | null) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			approval,
			approved,
			always,
		}: {
			approval: string;
			approved: boolean;
			always?: boolean;
		}) =>
			read(
				client.chat.sessions[":id"].approvals[":approval"].$post({
					param: { id: sessionId ?? "", approval },
					json: { approved, always: !!always },
				}),
			),
		onSettled: () => qc.invalidateQueries({ queryKey: qk.chat(sessionId) }),
	});
}

/** What a character remembers. */
export function useMemoryOverview(characterId: string) {
	return useQuery({
		queryKey: qk.memory(characterId),
		queryFn: ({ signal }) =>
			read(client.memory.$get({ query: { character_id: characterId } }, signalled(signal))),
	});
}

/** Clearing what a character remembers. */
export function useMemoryActions(characterId: string) {
	const qc = useQueryClient();
	const query = { character_id: characterId };
	const update = (data: MemoryOverview) => qc.setQueryData(qk.memory(characterId), data);
	const clear = useMutation({
		mutationFn: () => read(client.memory.$delete({ query })),
		onSuccess: (data) => {
			update(data);
			void qc.invalidateQueries({ queryKey: qk.chat(characterId) });
			void qc.invalidateQueries({ queryKey: qk.chatSessions() });
			void qc.invalidateQueries({ queryKey: qk.affinity() });
		},
	});
	return { clear };
}
