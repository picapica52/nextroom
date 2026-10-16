// The reply's sentences spoken one after another while the reply keeps streaming in. Each is
// synthesized as soon as it is complete and kept in memory (live-turn) for the browser to play;
// with speech turned off, the sentences only update the reply's text. The first failure stops
// the rest and aborts `stop`. The face shown with each sentence is chosen while the sentences
// before it are synthesized (expression.ts).

import type { ChatSegment } from "@nextroom/contracts";
import { speakAs } from "../characters/speak";
import type { VoiceSettings } from "../engine/voice";
import type { Job } from "../lib/jobs";
import type { faceChooser } from "./expression";
import { addSegment, settleSpeech, updateMessage } from "./live-turn";
import { type SpokenSentence, speakable } from "./speech";

type Faces = NonNullable<ChatSegment["faces"]>;

const NO_FACES: Promise<Faces> = Promise.resolve([]);

interface SpeakerOptions {
	job: Job;
	sessionId: string;
	replyId: string;
	ttsEnabled: boolean;
	voice: VoiceSettings;
	characterId: string | null;
	/** null: the faces do not change. */
	chooseFace: ReturnType<typeof faceChooser> | null;
	/** The reply's text so far. */
	text: () => string;
	stop: AbortController;
}

export function createSpeaker(options: SpeakerOptions) {
	const { job, sessionId, replyId, voice, characterId, chooseFace, text, stop } = options;
	let spokenCount = 0;
	let speaking = Promise.resolve();
	let speakError: unknown = null;

	const speak = async (sentence: SpokenSentence, faces: Promise<Faces>) => {
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
		const chosen = await faces;
		const segment = addSegment(sessionId, spoken, sentence, speech.wav, speech.duration);
		settleSpeech(sessionId, sentence.end);
		if (segment && chosen.length) segment.faces = chosen;
		spokenCount++;
		updateMessage(sessionId, replyId, { text: text() });
	};

	return {
		queue(found: SpokenSentence[]) {
			for (const sentence of found) {
				// Asked at once, so the answer is back by the time the sentence is synthesized.
				const faces =
					chooseFace && options.ttsEnabled && speakable(sentence.text)
						? chooseFace(sentence, text())
						: NO_FACES;
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
