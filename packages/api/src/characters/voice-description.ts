// A description of how a character sounds, for ElevenLabs' Voice Design: the conversation's LLM
// imagines the voice from the character's persona.

import { type Persona, replyEffortOf } from "@nextroom/contracts";
import { ConflictError } from "../lib/errors";
import { generateOnce } from "../mastra";
import { connectionOf } from "../mastra/providers";
import { loadSettings } from "../settings/chat";

/** The persona fields that tell how the character might sound. */
const SOURCE_FIELDS = [
	"world",
	"profile",
	"appearance",
	"personality",
	"speech",
	"habits",
] as const satisfies readonly (keyof Persona)[];

/** ElevenLabs' limit on a voice description. */
const MAX_LENGTH = 1000;

const INSTRUCTIONS = [
	"You write a voice description for a text-to-voice model that designs a new voice from it.",
	"From a fictional character's settings, imagine how the character's voice sounds.",
	"",
	"Rules:",
	"- Describe the voice itself: apparent age, gender, pitch, depth, timbre and texture, pace, intonation, and how emotion shows in it.",
	"- State that the speaker is a native Japanese speaker.",
	"- Never name the character, a work, or a real person.",
	"- Write one paragraph in English, between 200 and 600 characters.",
	"- Answer with the description only: no heading, no quotes, no markdown.",
].join("\n");

export async function describeVoice(persona: Persona, signal?: AbortSignal): Promise<string> {
	const settings = loadSettings();
	const connection = connectionOf(settings);
	const sources = Object.fromEntries(
		SOURCE_FIELDS.filter((k) => persona[k].trim()).map((k) => [k, persona[k]]),
	);
	if (!Object.keys(sources).length)
		throw new ConflictError("声を考えるには、先にプロフィールなどの設定を書いてください");
	const prompt = `<character_settings>\n${JSON.stringify(sources, null, 1)}\n</character_settings>`;
	const answer = await generateOnce(connection, INSTRUCTIONS, prompt, {
		temperature: 0.7,
		effort: replyEffortOf(settings),
		signal,
	});
	const value = answer
		.trim()
		.replace(/^```\w*\n?|\n?```$/g, "")
		.trim()
		.slice(0, MAX_LENGTH);
	if (!value) throw new ConflictError("LLM の返答が空でした。もう一度試してください");
	return value;
}
