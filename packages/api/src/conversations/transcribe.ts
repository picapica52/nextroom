// The user's recording of a turn, transcribed by the agent's voice. The user's message and the
// reply show the transcription's progress, and its failure or cancellation.

import type { ChatMessage, ChatSettings } from "@nextroom/contracts";

import { Cancelled, messageOf } from "../lib/errors";
import type { Job } from "../lib/jobs";
import { irodoriVoice } from "../mastra";
import { updateMessage } from "./live-turn";

/** The text of the turn's recording; empty when nothing intelligible was said. */
export async function transcribeTurn(
	job: Job,
	sessionId: string,
	messageIds: { user: string; reply: string },
	wav: Uint8Array,
	settings: Pick<ChatSettings, "asr_provider">,
): Promise<string> {
	const show = (changes: Partial<ChatMessage>) => {
		updateMessage(sessionId, messageIds.reply, changes);
		updateMessage(sessionId, messageIds.user, changes);
	};
	show({ status: "transcribing" });
	job.update(0.05, "文字起こし中");
	try {
		return await irodoriVoice.listen(wav, {
			provider: settings.asr_provider,
			signal: job.signal,
		});
	} catch (error) {
		show(
			error instanceof Cancelled
				? { status: "cancelled" }
				: { status: "error", error: messageOf(error) },
		);
		throw error;
	}
}
