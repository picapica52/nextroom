import type { SlackSettingsPatch, SlackSettingsView } from "@nextroom/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client, read, signalled } from "@/lib/api";
import { qk } from "@/lib/query-keys";

/** The bot's settings and how it is doing; refreshed while it is on. */
export function useSlackSettings() {
	return useQuery({
		queryKey: qk.slack(),
		queryFn: ({ signal }) => read(client.slack.settings.$get(undefined, signalled(signal))),
		refetchInterval: (q) => (q.state.data?.enabled ? 3000 : false),
	});
}

export function useSaveSlackSettings() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (patch: SlackSettingsPatch) => read(client.slack.settings.$patch({ json: patch })),
		onSuccess: (data) => qc.setQueryData<SlackSettingsView>(qk.slack(), data),
		onError: () => qc.invalidateQueries({ queryKey: qk.slack() }),
	});
}
