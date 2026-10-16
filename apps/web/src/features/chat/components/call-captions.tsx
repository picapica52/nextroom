import type { ChatMessage, ChatSegment } from "@nextroom/contracts";
import { cn } from "@nextroom/ui/lib/utils";
import { useEffect, useLayoutEffect } from "react";
import type { ReplyPart } from "@/components/reply-text";
import {
	isActive,
	type ReplyVoice,
	type RevealStore,
	useReveal,
	useRevealed,
} from "../conversation";
import { Caret, SpeakingBadge, ThinkingDots } from "./reply-marks";

/** See-through a little, so the face shows behind the captions. */
const BUBBLE = "bg-card/80 backdrop-blur-sm";

function Thinking() {
	return (
		<div className={cn("animate-bubble rounded-2xl border-2 px-4 py-2 shadow-puff", BUBBLE)}>
			<ThinkingDots />
		</div>
	);
}

/** Writes the newest reply out with its voice, playing the voice as it goes, and keeps how far it
 *  is in `store` for the captions and the log. Shows nothing itself; mounted per reply.
 *  `onBusy`: still writing out or waiting for voice. `skipped`: the rest shows at once, unspoken. */
export function ReplyReveal({
	reply,
	voice,
	store,
	skipped,
	onBusy,
}: {
	reply: ChatMessage;
	voice: ReplyVoice | null;
	store: RevealStore;
	skipped: boolean;
	onBusy: (busy: boolean) => void;
}) {
	const shown = useReveal(reply.text, isActive(reply), voice, skipped);
	const busy = shown.writing || shown.waiting;
	useEffect(() => onBusy(busy), [busy, onBusy]);
	useEffect(() => () => onBusy(false), [onBusy]);
	useLayoutEffect(() => store.set(reply.id, shown));
	return null;
}

/** The reply as captions: the line being written out with its voice, the narration before it in
 *  the narration face, and the line before that, small. `playing`: the sentence playing now. */
export function CallCaptions({
	reply,
	store,
	playing,
	hidden,
}: {
	reply: ChatMessage;
	store: RevealStore;
	playing: ChatSegment | null;
	hidden: boolean;
}) {
	const live = isActive(reply);
	const shown = useRevealed(store, reply.id);
	if (hidden || !shown) return null;

	const parts = shown.parts;
	const lastLine = parts.findLastIndex((p) => !p.narration);
	const lastNarration = parts.findLastIndex((p) => p.narration);
	// The newest part is the line, or narration after it; the line before that stays small above.
	const line = lastLine > lastNarration ? parts[lastLine] : null;
	const narrationAt = line ? (parts[lastLine - 1]?.narration ? lastLine - 1 : -1) : lastNarration;
	const narration = narrationAt >= 0 ? parts[narrationAt] : null;
	const before = parts.slice(0, narrationAt >= 0 ? narrationAt : lastLine);
	const previous = before.findLast((p) => !p.narration) ?? null;
	const newest = parts.at(-1);
	const caret = (p: ReplyPart) =>
		shown.writing && p === newest && <Caret narration={p.narration} />;
	const speaking =
		!!line &&
		!!playing &&
		line.start < playing.end &&
		playing.start < line.start + line.text.length;

	if (!parts.length) return live ? <Thinking /> : null;
	return (
		<>
			{previous && (
				<p className="m-0 max-w-[92%] truncate text-[12.5px] text-muted-foreground">
					{previous.text}
				</p>
			)}
			{narration && (
				<p
					key={narration.start}
					className="m-0 max-w-[92%] animate-ink px-3 text-center font-narration text-[13px] leading-[1.8] tracking-[0.02em] whitespace-pre-wrap text-muted-foreground"
				>
					{narration.text}
					{caret(narration)}
				</p>
			)}
			{line && (
				<div
					key={line.start}
					className={cn(
						"relative w-full animate-bubble rounded-2xl border-2 px-4 py-2.5 text-center text-[15.5px] leading-relaxed whitespace-pre-wrap shadow-puff transition-[border-color,box-shadow] duration-200 ease-smooth",
						BUBBLE,
						speaking && "border-pastel-lilac-edge shadow-[0_3px_0_0_var(--pastel-lilac-shadow)]",
					)}
				>
					{line.text}
					{caret(line)}
					{speaking && <SpeakingBadge />}
				</div>
			)}
			{shown.waiting && !line && <Thinking />}
		</>
	);
}
