import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client, read, signalled } from "@/lib/api";
import { qk } from "@/lib/query-keys";

export function useDesktopView(characterId: string) {
	return useQuery({
		queryKey: qk.desktop(characterId),
		queryFn: ({ signal }) =>
			read(client.desktops[":id"].$get({ param: { id: characterId } }, signalled(signal))),
		refetchInterval: (q) => (q.state.data?.starting ? 2000 : 10_000),
	});
}

export function useDesktopPower(characterId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (on: boolean) =>
			read(
				on
					? client.desktops[":id"].start.$post({ param: { id: characterId } })
					: client.desktops[":id"].stop.$post({ param: { id: characterId } }),
			),
		onSuccess: (data) => qc.setQueryData(qk.desktop(characterId), data),
	});
}

/** The page that shows the desktop (noVNC, served from its container); `control` takes it over. */
export const desktopScreenUrl = (characterId: string, control: boolean) =>
	`/api/desktops/${encodeURIComponent(characterId)}/vnc/nextroom.html${control ? "?mode=control" : ""}`;
