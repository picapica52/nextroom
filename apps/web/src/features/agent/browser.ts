import type { BrowserInput } from "@nextroom/contracts";
import { useQuery } from "@tanstack/react-query";
import { client, read, signalled } from "@/lib/api";
import { POLL } from "@/lib/constants";
import { qk } from "@/lib/query-keys";

export function useBrowserView(sessionId: string | null) {
	return useQuery({
		queryKey: qk.browser(sessionId),
		queryFn: ({ signal }) =>
			read(client.browser[":id"].$get({ param: { id: sessionId ?? "" } }, signalled(signal))),
		enabled: !!sessionId,
		refetchInterval: (q) => (q.state.data?.active ? POLL.browserActive : POLL.browserIdle),
	});
}

export const sendBrowserInput = (sessionId: string, input: BrowserInput) =>
	read(client.browser[":id"].input.$post({ param: { id: sessionId }, json: input }));
