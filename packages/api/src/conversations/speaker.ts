// The reply's sentences spoken one after another while the reply keeps streaming in. Each is
// synthesized as soon as it is complete and kept in memory (live-turn) for the browser to play;
// with speech turned off, the sentences only update the reply's text. The first failure stops
// the rest and aborts `stop`. The face tags the reply wrote decide the faces shown with each
// sentence (expression.ts).

import type { ChatSegment } from "@nextroom/contracts";
import { speakAs } from "../characters/speak";
import type { VoiceSettings } from "../engine/voice";
import type { Job } from "../lib/jobs";
import type { facePicker } from "./expression";
import type { FaceMark } from "./face-tags";
import { addSegment, settleSpeech, updateMessage } from "./live-turn";
import { type SpokenSentence, speakable } from "./speech";

type Faces = NonNullable<ChatSegment["faces"]>;

interface SpeakerOptions {
	job: Job;
	sessionId: string;
	replyId: string;
	ttsEnabled: boolean;
	voice: VoiceSettings;
	characterId: string | null;
	/** null: the faces do not change. */
	pickFace: ReturnType<typeof facePicker> | null;
	/** The reply's text so far, and the face tags taken out of it. */
	text: () => string;
	marks: FaceMark[];
	stop: AbortController;
}

export function createSpeaker(options: SpeakerOptions) {
	const { job, sessionId, replyId, voice, characterId, pickFace, text, marks, stop } = options;
	let spokenCount = 0;
	let speaking = Promise.resolve();
	let speakError: unknown = null;
	let nextMark = 0;

	const speak = async (sentence: SpokenSentence, faces: Faces) => {
		job.checkCancelled();
		if (!options.ttsEnabled) {
			updateMessage(sessionId, replyId, { text: text() });
			return;
		}
		const spoken = speakable(sentence.text);
		if (!spoken) return settleSpeech(sessionId, sentence.end);
		updateMessage(sessionId, replyId, { status: "speaking", text: text() });
		job.update(null, `音声合成中: ${spoken.slice(0, 20)}`);
		const speech = await speakAs(characterId, voice, spoken, job.signal);
		const segment = addSegment(sessionId, spoken, sentence, speech.wav, speech.duration);
		settleSpeech(sessionId, sentence.end);
		if (segment && faces.length) segment.faces = faces;
		spokenCount++;
		updateMessage(sessionId, replyId, { text: text() });
	};
	// The tags up to the sentence's end: those before it show from its start, those inside it from
	// where they are. A first tag inside it leaves the face before it as it was. The tags of a
	// sentence with nothing to say are left to the next one.
	const facesOf = (sentence: SpokenSentence): Faces => {
		const faces: Faces = [];
		if (!pickFace || !speakable(sentence.text)) return faces;
		for (; nextMark < marks.length; nextMark++) {
			const mark = marks[nextMark];
			if (!mark || mark.at >= sentence.end) break;
			const expression = pickFace(mark.tag);
			if (expression === undefined) continue;
			const length = sentence.end - sentence.start;
			const at = Math.min(Math.max((mark.at - sentence.start) / length, 0), 1);
			if (faces.at(-1)?.at === at) faces.pop();
			faces.push({ at, expression });
		}
		if (faces.length && (faces[0]?.at ?? 0) > 0) faces.unshift({ at: 0 });
		return faces;
	};

	return {
		queue(found: SpokenSentence[]) {
			for (const sentence of found) {
				const faces = facesOf(sentence);
				speaking = speaking
					.then(() => (speakError ? undefined : speak(sentence, faces)))
					.catch((error) => {
						speakError ??= error;
						stop.abort();
					});
			}
		},
		/** Waits for the queued sentences; the first error speaking them, or null. */
		async drain(): Promise<unknown> {
			await speaking;
			return speakError;
		},
		get spokenCount() {
			return spokenCount;
		},
	};
}
