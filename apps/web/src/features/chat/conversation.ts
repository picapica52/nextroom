import {
	ACTIVE_CHAT_STATUSES,
	type AgentStep,
	type CharacterView,
	type ChatMessage,
	type ChatSegment,
	type ChatStatus,
} from "@nextroom/contracts";
import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { type ReplyPart, replyLines, replyParts } from "@/components/reply-text";
import { MicUnavailableError } from "@/lib/recorder";

export const isActive = (m: ChatMessage) => ACTIVE_CHAT_STATUSES.includes(m.status);

/** The choices the conversation's last reply ended with (ask_user), while they are open. */
export function openChoices(messages: ChatMessage[]): AgentStep | null {
	const last = messages.at(-1);
	if (last?.role !== "assistant" || last.status !== "done") return null;
	return last.steps?.findLast((s) => s.question?.options.length) ?? null;
}

/** Every tool call of the conversation, in order. */
export const allSteps = (messages: ChatMessage[]) => messages.flatMap((m) => m.steps ?? []);

export const audioUrl = (sessionId: string, name: string) =>
	`/api/chat/sessions/${sessionId}/audio/${name}`;

export const STATUS_TEXT: Record<ChatStatus, string> = {
	queued: "順番待ちです（他の GPU ジョブの完了後に始まります）",
	transcribing: "聞き取っています…",
	thinking: "考えています…",
	awaiting: "確認を待っています（上のカードで「許可」か「拒否」を選んでください）",
	speaking: "話しています",
	done: "",
	error: "",
	cancelled: "",
	empty: "",
};

/** The name a conversation's partner is shown by. */
export const characterDisplayName = (
	character: CharacterView | undefined,
	characterId: string | null,
) =>
	character
		? character.persona.nickname || character.persona.name
		: characterId
			? "（削除されたキャラクター）"
			: "アシスタント";

/** A microphone error in words; `hint` follows it when the microphone cannot be used at all. */
export const micErrorText = (e: unknown, hint = "") =>
	e instanceof MicUnavailableError
		? `${e.message}${hint}`
		: e instanceof Error && e.name === "NotAllowedError"
			? `マイクの使用が許可されていません。${hint}`
			: String(e);

/** Silence between sentences, so they do not run into each other. */
const SENTENCE_GAP_MS = 400;

/** Plays reply sentences one after another as they arrive, with a short pause between them. */
class SegmentQueue {
	private el = new Audio();
	private pending: string[] = [];
	private gap: ReturnType<typeof setTimeout> | undefined;
	current: string | null = null;
	private listeners = new Set<() => void>();

	constructor() {
		this.el.addEventListener("ended", this.pause);
		this.el.addEventListener("error", this.next);
	}

	private set(url: string | null) {
		this.current = url;
		for (const l of this.listeners) l();
	}

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	// Stays `current` (and so `playing`) through the pause; the next sentence may arrive meanwhile.
	private pause = () => {
		this.gap = setTimeout(this.next, SENTENCE_GAP_MS);
	};

	private next = () => {
		this.gap = undefined;
		const url = this.pending.shift() ?? null;
		this.set(url);
		if (url) {
			this.el.src = url;
			this.el.play().catch(this.next);
		}
	};

	/** Seconds into the sentence playing (or just played). */
	elapsed = () => this.el.currentTime;

	/** True as soon as something is queued, before the re-render that updates `playing`. */
	get busy() {
		return this.current !== null;
	}

	enqueue(urls: string[]) {
		this.pending.push(...urls);
		if (!this.busy) this.next();
	}

	stop() {
		clearTimeout(this.gap);
		this.gap = undefined;
		this.pending = [];
		this.el.pause();
		this.set(null);
	}
}

export function useSegmentQueue() {
	const [queue] = useState(() => new SegmentQueue());
	const current = useSyncExternalStore(queue.subscribe, () => queue.current);
	useEffect(() => () => queue.stop(), [queue]);
	return { queue, current, playing: current !== null };
}

/** Milliseconds per character narration is written out at. */
const NARRATION_MS = 45;
/** Milliseconds per character spoken text is written out at when no voice leads it. */
const LINE_MS = 28;

/** The reply being read aloud: its sentences so far, how far into it they are settled, and the
 *  player they go to. */
export interface ReplyVoice {
	segments: ChatSegment[];
	until: number;
	/** The sentence playing now. */
	playing: ChatSegment | null;
	queue: SegmentQueue;
	url: (segment: ChatSegment) => string;
}

/** One character on from `i`, not splitting a surrogate pair. */
const stepOn = (text: string, i: number) => i + ((text.codePointAt(i) ?? 0) > 0xffff ? 2 : 1);

/** Nothing of the line holding `place` is written out yet. */
function lineUnstarted(text: string, part: ReplyPart, place: number) {
	const from = Math.max(part.start, text.lastIndexOf("\n", place - 1) + 1);
	return !text.slice(from, place).trim();
}

/** Writes a reply out from its start, one place moving through it: narration at a set pace, and
 *  each sentence read aloud played once the place reaches it, then written along with its voice.
 *  Spoken text no voice is coming for (or a reply not read aloud) goes at a set pace. `waiting`:
 *  the place waits for a sentence still being synthesized. A reply that was not streaming when it
 *  mounted shows whole. With reduced motion, what is not written along with a voice shows at once,
 *  and the sentences are still played. `skipped`: everything so far shows at once. */
export function useReveal(text: string, live: boolean, voice: ReplyVoice | null, skipped = false) {
	const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
	const [done, setDone] = useState(!live);
	const [, redraw] = useReducer((n: number) => n + 1, 0);
	const at = useRef({
		place: 0,
		/** Milliseconds not yet spent on writing at a set pace. */
		budget: 0,
		waiting: false,
		queued: new Set<string>(),
		started: new Set<string>(),
	});
	const latest = useRef({ text, live, voice, skipped });
	latest.current = { text, live, voice, skipped };

	useEffect(() => {
		if (done) return;
		const a = at.current;
		let last = performance.now();
		let frame = 0;
		const tick = (now: number) => {
			const { text, live, voice, skipped } = latest.current;
			a.budget += now - last;
			last = now;
			const was = `${a.place}:${a.waiting}`;
			const parts = replyParts(text);
			const paced = (ms: number) => {
				if (!reduced) {
					if (a.budget < ms) return false;
					a.budget -= ms;
				}
				a.place = stepOn(text, a.place);
				return true;
			};
			const hold = (waiting: boolean) => {
				a.waiting = waiting;
				a.budget = 0;
				return false;
			};
			const step = (): boolean => {
				a.waiting = false;
				if (skipped) a.place = text.length;
				if (a.place >= text.length) return hold(false);
				const part = parts.find((p) => p.start <= a.place && a.place < p.start + p.text.length);
				// A `*`, or a blank between parts.
				if (!part) {
					a.place++;
					return true;
				}
				if (part.narration) return paced(NARRATION_MS);
				if (!voice) return paced(LINE_MS);
				const segment = voice.segments.find((s) => s.start <= a.place && a.place < s.end);
				if (segment) {
					const url = voice.url(segment);
					if (!a.queued.has(url)) {
						a.queued.add(url);
						voice.queue.enqueue([url]);
					}
					if (voice.queue.current === url) {
						a.started.add(url);
						const ratio = segment.duration
							? Math.min(1, voice.queue.elapsed() / segment.duration)
							: 1;
						let to = segment.start + Math.round((segment.end - segment.start) * ratio);
						if (/[\uDC00-\uDFFF]/.test(text[to] ?? "")) to++;
						a.place = Math.max(a.place, to);
						if (a.place < segment.end) return hold(false);
						return true;
					}
					if (a.started.has(url)) {
						a.place = segment.end;
						return true;
					}
					return hold(lineUnstarted(text, part, a.place));
				}
				// Nothing to read here (a URL, say), or no voice is coming any more.
				if (a.place < voice.until || !live) return paced(LINE_MS);
				return hold(lineUnstarted(text, part, a.place));
			};
			for (let more = true; more; ) more = step();
			if (a.place >= text.length && !live) return setDone(true);
			if (`${a.place}:${a.waiting}` !== was) redraw();
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [done, reduced]);

	if (done) return { parts: replyLines(text), writing: false, waiting: false };
	const a = at.current;
	return { parts: replyLines(text.slice(0, a.place)), writing: !a.waiting, waiting: a.waiting };
}

type Revealed = ReturnType<typeof useReveal>;

const NO_SUBSCRIPTION = () => () => {};

const sameParts = (a: ReplyPart[], b: ReplyPart[]) =>
	a.length === b.length &&
	a.every(
		(p, i) => p.text === b[i]?.text && p.start === b[i]?.start && p.narration === b[i]?.narration,
	);

/** How far the newest reply is written out, kept in one place so the captions and the log show
 *  the same text and its voice is played once. */
export class RevealStore {
	private value: (Revealed & { id: string }) | null = null;
	private listeners = new Set<() => void>();

	set(id: string, shown: Revealed) {
		const was = this.value;
		if (
			was?.id === id &&
			was.writing === shown.writing &&
			was.waiting === shown.waiting &&
			sameParts(was.parts, shown.parts)
		)
			return;
		this.value = { id, ...shown };
		for (const l of this.listeners) l();
	}

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	of = (id: string) => (this.value?.id === id ? this.value : null);
}

/** The reply's text as written out so far, while it is the one the store follows. */
export function useRevealed(store: RevealStore | null, id: string) {
	return useSyncExternalStore(store?.subscribe ?? NO_SUBSCRIPTION, () => store?.of(id) ?? null);
}
