// The reply's sentences spoken one after another while the reply keeps streaming in. Each is
// synthesized as soon as it is complete and kept in memory (live-turn) for the browser to play;
// with speech turned off, the sentences only update the reply's text. The first failure stops
// the rest and aborts `stop`.

import { speakAs } from "../characters/speak";
import type { VoiceSettings } from "../engine/voice";
import type { Job } from "../lib/jobs";
import { addSegment, settleSpeech, updateMessage } from "./live-turn";
import { type SpokenSentence, speakable } from "./speech";

interface SpeakerOptions {
	job: Job;
	sessionId: string;
	replyId: string;
	ttsEnabled: boolean;
	voice: VoiceSettings;
	characterId: string | null;
	/** The reply's text so far. */
	text: () => string;
	stop: AbortController;
}

export function createSpeaker(options: SpeakerOptions) {
	const { job, sessionId, replyId, voice, characterId, text, stop } = options;
	let spokenCount = 0;
	let speaking = Promise.resolve();
	let speakError: unknown = null;

	const speak = async (sentence: SpokenSentence) => {
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
		addSegment(sessionId, spoken, sentence, speech.wav, speech.duration);
		settleSpeech(sessionId, sentence.end);
		spokenCount++;
		updateMessage(sessionId, replyId, { text: text() });
	};

	return {
		queue(found: SpokenSentence[]) {
			for (const sentence of found) {
				speaking = speaking
					.then(() => (speakError ? undefined : speak(sentence)))
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
