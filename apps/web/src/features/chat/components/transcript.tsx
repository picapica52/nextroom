import type { CharacterView, ChatMessage, ChatSegment } from "@nextroom/contracts";
import { Spinner } from "@nextroom/ui/components/spinner";
import { cn } from "@nextroom/ui/lib/utils";
import { Mic } from "lucide-react";
import { memo, type ReactNode, useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Dot, ErrorNote } from "@/components/status";
import { CharacterAvatar } from "@/features/characters/components/character-avatar";
import { chatImageUrl } from "@/lib/api";
import { SCROLL_BOTTOM_SLACK_PX } from "@/lib/constants";
import { isActive, type RevealStore, STATUS_TEXT, useReveal, useRevealed } from "../conversation";
import { ReplySteps } from "./reply";
import { Caret, SpeakingBadge, ThinkingDots } from "./reply-marks";

export const Transcript = memo(function Transcript({
	sessionId,
	messages,
	character,
	name,
	reveal = null,
	playing = null,
	emptyState,
}: {
	sessionId: string | null;
	messages: ChatMessage[];
	character: CharacterView | null;
	name: string;
	/** The newest reply as the captions write it out, with its voice. */
	reveal?: RevealStore | null;
	/** The sentence of that reply playing now. */
	playing?: ChatSegment | null;
	emptyState: ReactNode;
}) {
	const scroller = useRef<HTMLDivElement>(null);
	const content = useRef<HTMLDivElement>(null);
	// Scrolled to the bottom; a reply typed out after that keeps it there.
	const atBottom = useRef(true);
	const lastMessage = messages.at(-1);
	const lastKey = `${lastMessage?.text}|${lastMessage?.steps?.length}|${lastMessage?.images?.length}|${lastMessage?.status}`;
	// Keep the newest message in view; only the transcript scrolls, never the page.
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever the last message grows
	useEffect(() => {
		const el = scroller.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messages.length, lastKey, sessionId]);
	useEffect(() => {
		const el = scroller.current;
		if (!el || !content.current) return;
		const observer = new ResizeObserver(() => {
			if (atBottom.current) el.scrollTop = el.scrollHeight;
		});
		observer.observe(content.current);
		return () => observer.disconnect();
	}, []);

	return (
		<div
			ref={scroller}
			className="max-h-[70svh] min-h-64 flex-1 overflow-x-hidden overflow-y-auto lg:max-h-none"
			onScroll={(e) => {
				const el = e.currentTarget;
				atBottom.current =
					el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_BOTTOM_SLACK_PX;
			}}
		>
			<div ref={content} className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-6">
				{!sessionId || messages.length === 0
					? emptyState
					: messages.map((m) => {
							// Noise that held no words; the status line said so at the time.
							if (m.status === "empty" || m.hidden) return null;
							if (m.role === "user") return <UserMessage key={m.id} m={m} sessionId={sessionId} />;
							return (
								<AssistantMessage
									key={m.id}
									m={m}
									sessionId={sessionId}
									character={character}
									name={name}
									reveal={reveal}
									playing={playing}
								/>
							);
						})}
			</div>
		</div>
	);
});

/** What the user said: a bubble on the right, marked when it was spoken, under the images they
 *  attached. */
function UserMessage({ m, sessionId }: { m: ChatMessage; sessionId: string }) {
	const onlyImages = !m.text && !!m.images?.length && !isActive(m);
	return (
		<div className="group/msg flex animate-rise flex-col items-end gap-1">
			<MessageImages sessionId={sessionId} images={m.images} className="justify-end" />
			{!onlyImages && (
				<div className="max-w-[80%] rounded-2xl rounded-br-sm border-2 bg-pastel-lilac px-3.5 py-2.5 shadow-puff text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">
					{m.spoken && (
						<div className="mb-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
							<Mic className="size-3" aria-hidden="true" />
							音声入力
						</div>
					)}
					{m.text || <span className="opacity-70">{bubblePlaceholder(m)}</span>}
				</div>
			)}
			{m.text && !isActive(m) && <CopyButton text={m.text} />}
			<MessageMeta m={m} />
			{m.status === "error" && m.error && <ErrorNote error={m.error} />}
		</div>
	);
}

/** A message's images, each opening full size in a new tab. */
function MessageImages({
	sessionId,
	images,
	className,
}: {
	sessionId: string;
	images: string[] | undefined;
	className?: string;
}) {
	if (!images?.length) return null;
	return (
		<div className={cn("flex max-w-[80%] flex-wrap gap-2", className)}>
			{images.map((id) => {
				const url = chatImageUrl(sessionId, id);
				return (
					<a
						key={id}
						href={url}
						target="_blank"
						rel="noreferrer"
						className="block overflow-hidden rounded-2xl border-2 bg-muted shadow-puff outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
					>
						<img
							src={url}
							alt="画像"
							loading="lazy"
							className={cn(
								"block object-cover",
								images.length === 1 ? "max-h-72 max-w-full" : "size-32 sm:size-40",
							)}
						/>
					</a>
				);
			})}
		</div>
	);
}

function MessageMeta({ m }: { m: ChatMessage }) {
	return (
		<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
			{isActive(m) && <Spinner className="size-3" />}
			{isActive(m) && m.text && <span>{STATUS_TEXT[m.status]}</span>}
			{m.status === "cancelled" && <span>中断しました</span>}
		</div>
	);
}

/** A reply: narration as plain text beside the avatar, each spoken line in its own bubble.
 *  A reply streaming when it mounts is written out, its parts springing or inking in; the newest
 *  one goes with the captions and its voice. Once it is written, it can be copied. */
function AssistantMessage({
	m,
	sessionId,
	character,
	name,
	reveal,
	playing,
}: {
	m: ChatMessage;
	sessionId: string;
	character: CharacterView | null;
	name: string;
	reveal: RevealStore | null;
	playing: ChatSegment | null;
}) {
	const live = isActive(m);
	const [fresh] = useState(live);
	const own = useReveal(m.text, live, null);
	const shared = useRevealed(reveal, m.id);
	const shown = shared ?? own;
	const parts = shown.parts;
	const steps = m.steps ?? [];
	const firstLine = parts.findIndex((p) => !p.narration);
	const readable = !live && !shown.writing && !shown.waiting;
	const dots = (
		<div className="w-fit max-w-full origin-top-left animate-bubble rounded-2xl rounded-tl-sm border-2 bg-card px-3.5 py-2.5 text-sm leading-relaxed shadow-puff">
			<ThinkingDots />
		</div>
	);
	return (
		<div className="group/msg flex animate-rise items-start gap-2.5">
			<CharacterAvatar character={character} className="size-7" />
			<div className="flex min-w-0 flex-1 flex-col items-start gap-2">
				<div className="text-xs font-bold text-muted-foreground">{name}</div>
				<AffinityMarks m={m} />
				{parts.map((p, i) => {
					const caret = shown.writing && i === parts.length - 1 && (
						<Caret narration={p.narration} />
					);
					if (p.narration)
						return (
							<p
								// biome-ignore lint/suspicious/noArrayIndexKey: parts only grow at the end
								key={i}
								className={cn(
									"m-0 px-1 font-narration text-[13.5px] leading-[1.8] tracking-[0.02em] wrap-anywhere whitespace-pre-wrap text-muted-foreground",
									fresh && "animate-ink",
								)}
							>
								{p.text}
								{caret}
							</p>
						);
					const speaking =
						!!shared &&
						!!playing &&
						p.start < playing.end &&
						playing.start < p.start + p.text.length;
					return (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: parts only grow at the end
							key={i}
							className={cn(
								"relative w-fit min-w-0 max-w-full origin-top-left rounded-2xl border-2 bg-card px-3.5 py-2.5 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap shadow-puff transition-[border-color,box-shadow] duration-200 ease-smooth",
								i === firstLine && "rounded-tl-sm",
								fresh && "animate-bubble",
								speaking &&
									"border-pastel-lilac-edge shadow-[0_3px_0_0_var(--pastel-lilac-shadow)]",
							)}
						>
							{p.text}
							{caret}
							{speaking && <SpeakingBadge />}
						</div>
					);
				})}
				{parts.length
					? shown.waiting && dots
					: !steps.length &&
						!m.images?.length &&
						(live || shown.writing || shown.waiting ? (
							dots
						) : (
							<div className="w-fit max-w-full rounded-2xl rounded-tl-sm border-2 bg-card px-3.5 py-2.5 text-sm leading-relaxed shadow-puff">
								<span className="text-muted-foreground">{bubblePlaceholder(m)}</span>
							</div>
						))}
				<ReplySteps steps={steps} />
				<MessageImages sessionId={sessionId} images={m.images} />
				{readable && parts.length > 0 && (
					<div className="flex flex-wrap items-center gap-1">
						<CopyButton text={parts.map((p) => p.text).join("\n")} labelled />
					</div>
				)}
				<MessageMeta m={m} />
				{m.status === "error" && m.error && <ErrorNote error={m.error} />}
			</div>
		</div>
	);
}

/** The event the reply started, and the level reached with it. */
function AffinityMarks({ m }: { m: ChatMessage }) {
	const { event, level_up } = m.affinity ?? {};
	if (!event && !level_up) return null;
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{event && <Dot tone="info">イベント: {event.label}</Dot>}
			{level_up && (
				<Dot tone="success">
					Lv{level_up.level} {level_up.label} になった
				</Dot>
			)}
		</div>
	);
}

function bubblePlaceholder(m: ChatMessage) {
	if (m.status === "error") return "（失敗しました）";
	if (m.status === "cancelled") return "（中断）";
	return STATUS_TEXT[m.status] || "…";
}
