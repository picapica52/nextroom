import type { DiscordSettingsPatch, DiscordSettingsView } from "@nextroom/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client, read, signalled } from "@/lib/api";
import { qk } from "@/lib/query-keys";

/** The bot's settings and how it is doing; refreshed while it logs in or sits in a channel. */
export function useDiscordSettings() {
	return useQuery({
		queryKey: qk.discord(),
		queryFn: ({ signal }) => read(client.discord.settings.$get(undefined, signalled(signal))),
		refetchInterval: (q) => (q.state.data?.enabled ? 3000 : false),
	});
}

export function useSaveDiscordSettings() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (patch: DiscordSettingsPatch) =>
			read(client.discord.settings.$patch({ json: patch })),
		onSuccess: (data) => qc.setQueryData<DiscordSettingsView>(qk.discord(), data),
		onError: () => qc.invalidateQueries({ queryKey: qk.discord() }),
	});
}
