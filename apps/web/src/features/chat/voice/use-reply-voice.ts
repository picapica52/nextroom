import type { ChatMessage, ChatSegment, ChatSession } from "@nextroom/contracts";
import { useEffect, useState } from "react";
import { audioUrl, type ReplyVoice, type useSegmentQueue } from "../conversation";

/** The newest reply's voice: which reply is read aloud, the sentence playing, the face it shows,
 *  and stopping it. `segments`: the player the sentences go to. */
export function useReplyVoice({
	sessionId,
	session,
	messages,
	segments,
}: {
	sessionId: string | null;
	session: ChatSession | undefined;
	messages: ChatMessage[];
	segments: ReturnType<typeof useSegmentQueue>;
}) {
	const { queue: player, current } = segments;
	// The reply asked for last, spoken as its captions are written out.
	const [voicedId, setVoicedId] = useState<string | null>(null);
	// The captions are still being written out, so more of the voice may follow.
	const [writing, setWriting] = useState(false);
	const [face, setFace] = useState<string | null>(null);
	// The reply stopped with the stop button: what was written of it shows at once.
	const [skippedId, setSkippedId] = useState<string | null>(null);

	// Another conversation: the voice of this one stops.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset whenever the conversation changes
	useEffect(() => {
		player.stop();
		setVoicedId(null);
		setFace(null);
	}, [sessionId, player]);

	const speech = session?.speech ?? null;
	const voiced = speech?.message_id === voicedId ? speech : null;
	// The sentence playing.
	const segment =
		(sessionId && speech?.segments.find((s) => audioUrl(sessionId, s.audio) === current)) || null;
	const reply = messages.findLast((m) => m.role === "assistant");
	const voice: ReplyVoice | null =
		voicedId && sessionId && reply?.id === voicedId
			? {
					segments: voiced?.segments ?? [],
					until: voiced?.until ?? 0,
					playing: voiced ? segment : null,
					queue: player,
					url: (s: ChatSegment) => audioUrl(sessionId, s.audio),
				}
			: null;

	// The face of the phrase playing; it stays until a later phrase has one of its own.
	useEffect(() => {
		const faces = segment?.faces;
		if (!segment || !faces?.length) return;
		let frame = 0;
		const follow = () => {
			const ratio = segment.duration ? player.elapsed() / segment.duration : 0;
			const shown = faces.findLast((f) => f.at <= ratio) ?? faces[0];
			if (shown?.expression !== undefined) setFace(shown.expression);
			frame = requestAnimationFrame(follow);
		};
		follow();
		return () => cancelAnimationFrame(frame);
	}, [segment, player]);

	return {
		reply,
		voice,
		face,
		writing,
		setWriting,
		skipped: !!reply && reply.id === skippedId,
		/** Reads the reply with this id aloud as it is written out (null: none). */
		follow: setVoicedId,
		/** Stops the voice playing, leaving the reply as it is. */
		silence: () => player.stop(),
		/** Stops the reply's voice; what was written of it shows at once. */
		stop: () => {
			player.stop();
			setVoicedId(null);
			setSkippedId(reply?.id ?? null);
		},
	};
}
