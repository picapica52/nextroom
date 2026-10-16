import type { ChatSession, ChatTurn } from "@nextroom/contracts";
import { type QueryClient, type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { client, read, signalled } from "@/lib/api";
import { qk } from "@/lib/query-keys";

export function useChatSessions() {
	return useQuery({
		queryKey: qk.chatSessions(),
		queryFn: ({ signal }) => read(client.chat.sessions.$get(undefined, signalled(signal))),
	});
}

export function useChatSession(
	id: string | null,
	options: Omit<UseQueryOptions<ChatSession>, "queryKey" | "queryFn">,
) {
	return useQuery({
		queryKey: qk.chat(id),
		queryFn: ({ signal }): Promise<ChatSession> =>
			read(client.chat.sessions[":id"].$get({ param: { id: id ?? "" } }, signalled(signal))),
		...options,
	});
}

/** What the user sends in a turn. */
export interface TurnInput {
	audio?: Blob;
	text?: string;
	images?: File[];
}

/** The form a turn is sent as: a recording or typed text, and any images. The reply is read
 *  aloud (when speech synthesis is on). */
export function turnForm(input: TurnInput) {
	const form = new FormData();
	if (input.audio) form.append("audio", input.audio, "turn.wav");
	form.append("text", input.text ?? "");
	for (const image of input.images ?? []) form.append("images", image, image.name);
	form.append("speak", "1");
	return form;
}

/** Shows a sent turn in its conversation at once, then refreshes what it changed. */
export function appendTurn(qc: QueryClient, id: string, turn: ChatTurn) {
	qc.setQueryData<ChatSession>(
		qk.chat(id),
		(old) =>
			old && {
				...old,
				messages: [...old.messages, ...(turn.user.hidden ? [] : [turn.user]), turn.assistant],
			},
	);
	void qc.invalidateQueries({ queryKey: qk.chat(id) });
	void qc.invalidateQueries({ queryKey: qk.chatSessions() });
}
