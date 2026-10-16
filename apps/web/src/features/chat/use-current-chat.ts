import type { ChatMessage, ChatTurn } from "@nextroom/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import { useCancelEngineJob } from "@/hooks/engine";
import { useLocalState } from "@/hooks/use-local-state";
import { api, client, read } from "@/lib/api";
import { POLL, STORAGE_KEYS } from "@/lib/constants";
import { qk } from "@/lib/query-keys";
import { isActive } from "./conversation";
import { appendTurn, type TurnInput, turnForm, useChatSession, useChatSessions } from "./queries";

const NO_MESSAGES: ChatMessage[] = [];

/** The conversation the chat page shows: the character in the address, else the one talked
 *  with last. Each character has one conversation, whose id is the character's. */
export function useCurrentChat({
	keepPolling,
	onSent,
	onSettled,
}: {
	/** Keep refreshing after the reply is done: the faces of the last sentences may come later. */
	keepPolling: boolean;
	/** A turn was accepted, before it is added to the conversation. */
	onSent: (turn: ChatTurn) => void;
	onSettled: () => void;
}) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const location = useLocation();
	// The conversation open last; /chat opens it again.
	const [lastSession, setLastSession] = useLocalState<string | null>(
		STORAGE_KEYS.chatSession,
		null,
	);

	const sessions = useChatSessions();
	const onChat = !!matchPath({ path: "/chat", end: false }, location.pathname);
	// Behind a character's settings, that character's conversation.
	const wanted =
		(
			matchPath("/chat/:sessionId", location.pathname) ??
			matchPath({ path: "/characters/:sessionId", end: false }, location.pathname)
		)?.params.sessionId ?? null;
	const known = (id: string | null) => !!id && !!sessions.data?.some((s) => s.id === id);
	const fallback = known(lastSession) ? lastSession : (sessions.data?.[0]?.id ?? null);
	const currentId = known(wanted) ? wanted : onChat ? null : fallback;

	// /chat opens the last conversation (or the latest); an unknown one falls back the same way.
	useEffect(() => {
		if (!onChat || !sessions.data || (wanted && known(wanted))) return;
		if (fallback && fallback !== wanted)
			navigate(`/chat/${fallback}${location.search}`, { replace: true });
		else if (wanted && !fallback) navigate(`/chat${location.search}`, { replace: true });
	});
	useEffect(() => {
		if (currentId) setLastSession(currentId);
	}, [currentId, setLastSession]);

	const session = useChatSession(currentId, {
		enabled: !!currentId,
		refetchInterval: (q) =>
			q.state.data?.messages.some(isActive) || keepPolling ? POLL.chatReply : false,
	});
	const messages = (currentId && session.data?.messages) || NO_MESSAGES;
	const activeTurn = messages.find((m) => m.role === "assistant" && isActive(m)) ?? null;
	// The turn is stored once the reply ends: the list's last messages change only then.
	const replying = !!activeTurn;
	useEffect(() => {
		if (replying) return;
		void qc.invalidateQueries({ queryKey: qk.chatSessions() });
		void qc.invalidateQueries({ queryKey: qk.affinity() });
	}, [replying, qc]);

	const send = useMutation({
		mutationFn: async ({ id, input }: { id: string; input: TurnInput }) => ({
			id,
			turn: await api.post<ChatTurn>(`/api/chat/sessions/${id}/turns`, turnForm(input)),
		}),
		onSuccess: ({ id, turn }) => {
			onSent(turn);
			appendTurn(qc, id, turn);
		},
		onSettled,
	});
	// The character speaks first as its conversation is opened, when it has something to start
	// with (the server answers null when it does not).
	const open = useMutation({
		mutationFn: (id: string) =>
			read(
				client.chat.sessions[":id"].opening.$post({ param: { id }, query: { speak: "1" } }),
			).then((turn) => ({ id, turn })),
		onSuccess: ({ id, turn }) => {
			if (!turn) return;
			onSent(turn);
			appendTurn(qc, id, turn);
		},
	});
	const opened = useRef<string | null>(null);
	useEffect(() => {
		if (!currentId || opened.current === currentId) return;
		opened.current = currentId;
		open.mutate(currentId);
	});
	const cancel = useCancelEngineJob();

	return {
		sessions: sessions.data,
		/** The list has loaded and there is no character to talk with. */
		noCharacters: !!sessions.data && sessions.data.length === 0,
		currentId,
		session: currentId ? session.data : undefined,
		messages,
		activeTurn,
		/** A turn can be sent: none is being sent and no reply is under way. */
		canSend: !!currentId && !send.isPending && !open.isPending && !activeTurn,
		sending: send.isPending,
		error: send.error,
		sendTurn: (input: TurnInput, onSuccess?: () => void) => {
			if (currentId) send.mutate({ id: currentId, input }, { onSuccess });
		},
		/** Stops the reply under way on the server. */
		cancelReply: () => {
			if (activeTurn?.job_id) cancel.mutate(activeTurn.job_id);
		},
	};
}
