import type { VoiceSettings } from "@nextroom/contracts";

import { irodoriVoice } from "../mastra";
import { speakFiles } from "./voice-files";

/** `text` spoken with `voice` and the character's voice files (none without a character). */
export async function speakAs(
	characterId: string | null,
	voice: VoiceSettings,
	text: string,
	signal?: AbortSignal,
): Promise<{ wav: Uint8Array; duration: number; seed: number }> {
	const { audio, duration, seed } = await irodoriVoice.synthesize(text, {
		settings: { ...voice, ...speakFiles(characterId, voice) },
		signal,
	});
	return { wav: audio, duration, seed };
}
