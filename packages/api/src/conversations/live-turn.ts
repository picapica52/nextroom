// The turn in progress per conversation, held in memory only: its two messages while they
// are transcribed, thought about and spoken, and the reply's synthesized sentences, which the
// browser (or the Discord bot) plays as they arrive and which are never written to disk.
//
// A turn that ends well is in the Mastra thread from then on, so only its audio stays here,
// for a few minutes. A turn that fails or is cancelled stays as it is until the next turn,
// since Mastra may not have saved it. Restarting the server forgets all of it.

import {
	ACTIVE_CHAT_STATUSES,
	type ChatMessage,
	type ChatSegment,
	type ChatSpeech,
} from "@nextroom/contracts";

import { NotFoundError } from "../lib/errors";
import { queue } from "../lib/jobs";
import { now } from "../lib/storage";

const KEEP_AUDIO_MS = 10 * 60 * 1000;

interface LiveTurn {
	/** Thread messages saved since are this turn's, and hidden while it shows its own. */
	startedAt: Date;
	replyId: string;
	messages: ChatMessage[] | null;
	segments: ChatSegment[];
	/** ChatSpeech.until. */
	until: number;
	clips: Map<string, Uint8Array>;
	timer?: ReturnType<typeof setTimeout>;
}

const live = new Map<string, LiveTurn>();

/** Told of each sentence as soon as it is synthesized: the reply it is of, and its WAV. */
type SegmentListener = (replyId: string, segment: ChatSegment, wav: Uint8Array) => void;
const segmentListeners = new Map<string, Set<SegmentListener>>();

/** Listens to the conversation's synthesized sentences until the returned function is called. */
export function onSegment(sessionId: string, listener: SegmentListener): () => void {
	const listeners = segmentListeners.get(sessionId) ?? new Set();
	segmentListeners.set(sessionId, listeners.add(listener));
	return () => {
		listeners.delete(listener);
		if (!listeners.size) segmentListeners.delete(sessionId);
	};
}

/** A new turn replaces the conversation's previous one. */
export function startTurn(sessionId: string, user: ChatMessage, reply: ChatMessage): void {
	dropTurn(sessionId);
	live.set(sessionId, {
		startedAt: new Date(),
		replyId: reply.id,
		messages: [user, reply],
		segments: [],
		until: 0,
		clips: new Map(),
	});
}

export function dropTurn(sessionId: string): void {
	clearTimeout(live.get(sessionId)?.timer);
	live.delete(sessionId);
}

export function liveMessage(sessionId: string, messageId: string): ChatMessage | undefined {
	return live.get(sessionId)?.messages?.find((m) => m.id === messageId);
}

/** Changes a message of the turn; nothing happens once the turn is gone. */
export function updateMessage(
	sessionId: string,
	messageId: string,
	changes: Partial<ChatMessage>,
): void {
	const message = liveMessage(sessionId, messageId);
	if (message) Object.assign(message, changes);
}

export function removeMessage(sessionId: string, messageId: string): void {
	const turn = live.get(sessionId);
	if (turn?.messages) turn.messages = turn.messages.filter((m) => m.id !== messageId);
}

/** The turn is in the thread now: show the thread's messages, keep the audio a while. */
export function settleTurn(sessionId: string): void {
	const turn = live.get(sessionId);
	if (!turn) return;
	turn.messages = null;
	turn.timer = setTimeout(() => {
		if (live.get(sessionId) === turn) live.delete(sessionId);
	}, KEEP_AUDIO_MS);
}

/** The turn's messages and when it started, while they are shown instead of the thread's. */
export function liveTurn(sessionId: string): { startedAt: Date; messages: ChatMessage[] } | null {
	const turn = live.get(sessionId);
	if (!turn?.messages) return null;
	for (const message of turn.messages) closeOrphan(message);
	return { startedAt: turn.startedAt, messages: turn.messages.map((m) => ({ ...m })) };
}

/** A turn whose job is gone (cancelled while queued) ends as cancelled or as an error. */
function closeOrphan(message: ChatMessage): void {
	if (!ACTIVE_CHAT_STATUSES.includes(message.status)) return;
	const job = queue.get(message.job_id ?? "");
	if (job && job.status !== "cancelled" && job.status !== "error" && job.status !== "done") return;
	message.status = !job || job.status === "error" ? "error" : "cancelled";
	if (message.status === "error") message.error = message.error || job?.error || "中断されました";
	for (const step of message.steps ?? []) {
		if (step.status !== "running" && step.status !== "awaiting") continue;
		step.status = "error";
		step.finished_at = now();
		delete step.approval;
	}
}

/** True while the conversation has a turn that is still running. */
export function turnRunning(sessionId: string): boolean {
	return !!liveTurn(sessionId)?.messages.some((m) => {
		const job = queue.get(m.job_id ?? "");
		return ACTIVE_CHAT_STATUSES.includes(m.status) && job && !job.cancelled;
	});
}

/** The segment stays changeable: its faces may be chosen after it is added. */
export function addSegment(
	sessionId: string,
	text: string,
	place: { start: number; end: number },
	wav: Uint8Array,
	duration: number,
): ChatSegment | undefined {
	const turn = live.get(sessionId);
	if (!turn) return;
	const name = `${turn.replyId}_${String(turn.segments.length).padStart(2, "0")}.wav`;
	turn.clips.set(name, wav);
	const segment: ChatSegment = { text, start: place.start, end: place.end, audio: name, duration };
	turn.segments.push(segment);
	for (const listener of segmentListeners.get(sessionId) ?? [])
		listener(turn.replyId, segment, wav);
	return segment;
}

/** The reply's sentences are settled up to `until`. */
export function settleSpeech(sessionId: string, until: number): void {
	const turn = live.get(sessionId);
	if (turn) turn.until = Math.max(turn.until, until);
}

export function speechOf(sessionId: string): ChatSpeech | null {
	const turn = live.get(sessionId);
	if (!turn || (!turn.segments.length && !turn.until)) return null;
	return { message_id: turn.replyId, segments: [...turn.segments], until: turn.until };
}

export function clipOf(sessionId: string, name: string): Uint8Array {
	const clip = live.get(sessionId)?.clips.get(name);
	if (!clip) throw new NotFoundError("音声がありません");
	return clip;
}
