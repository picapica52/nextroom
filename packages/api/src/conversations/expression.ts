// The face the call screen shows while each sentence of a reply plays. The reply itself knows
// nothing of faces: the Decisions API reads each sentence, with the user's words and the reply
// before it, and chooses one of the tags the character has a face for. The face stays until the
// next sentence's.

import type { ChatSegment, Expression, ExpressionTag } from "@nextroom/contracts";
import { chooseForText } from "../decisions/client";
import { NEUTRAL_FACE_TAG } from "./face-tags";
import type { SpokenSentence } from "./speech";

type Faces = NonNullable<ChatSegment["faces"]>;

/** A sentence still undecided after this long keeps the face before it. */
const DECIDE_TIMEOUT_MS = 10_000;
/** How much of the reply before the sentence the Decisions API reads. */
const CONTEXT_CHARS = 600;

/** What each tag means as a feeling, which the Decisions API reads the sentence for. */
const FEELINGS: Record<ExpressionTag, string> = {
	joy: "overjoyed, laughing, delighted",
	smile: "pleased, warm, gently happy, relieved",
	excited: "excited, eager, thrilled about something",
	love: "affectionate, adoring, tender toward the user",
	embarrassed: "embarrassed, shy, flustered, blushing",
	sad: "sad, disappointed, lonely, hurt",
	crying: "crying, in tears, overwhelmed",
	angry: "angry, furious, outraged",
	annoyed: "annoyed, irritated, fed up",
	pouting: "sulking, pouting, jealous, a little hurt and demanding",
	surprised: "surprised, startled",
	shocked: "shocked, stunned, dumbfounded",
	scared: "scared, frightened, panicking",
	anxious: "worried, nervous, uneasy",
	confused: "confused, puzzled, not following",
	troubled: "troubled, awkward, at a loss, forcing a smile",
	thinking: "thinking, wondering, curious, considering",
	serious: "serious, determined, earnest, firm",
	smug: "smug, proud, confident, showing off",
	mischievous: "mischievous, teasing, playful, scheming",
	calm: "calm, peaceful, relaxed",
	sleepy: "sleepy, drowsy, yawning",
	tired: "tired, exhausted, bored, sighing",
};

const NEUTRAL_FEELING =
	"no particular feeling: plain talk, explaining or answering in an ordinary tone";

const instructionsOf = (char: string) =>
	`On a voice call, the user's screen shows a picture of ${char}'s face that changes with what ${char} says. ` +
	`Which face fits ${char} while saying the current line? Read the feeling of the line in the flow of the conversation, ` +
	`including ${char}'s tone and emoji. Choose ${NEUTRAL_FACE_TAG} when no particular feeling shows.`;

/** The tags of the character's expressions; empty: the face does not change. */
export const faceTagsOf = (expressions: Expression[]) => [
	...new Set(expressions.flatMap((e) => (e.tag ? [e.tag] : []))),
];

/** Chooses the face for each sentence of one reply, in the order they are asked; a sentence that
 *  cannot be decided keeps the face before it. One of several faces with a tag is picked at
 *  random, and kept while the same tag repeats. */
export function faceChooser(options: {
	expressions: Expression[];
	/** The tags the character may use now. */
	tags: string[];
	charName: string;
	userText: string;
	signal: AbortSignal;
}) {
	const { expressions, charName, userText } = options;
	const criteria: Record<string, string> = { [NEUTRAL_FACE_TAG]: NEUTRAL_FEELING };
	for (const tag of options.tags) criteria[tag] = FEELINGS[tag as ExpressionTag] ?? tag;
	const instructions = instructionsOf(charName);
	let shown: { tag: string; id: string | null } | null = null;
	let previous: Promise<unknown> = Promise.resolve();

	const pick = (tag: string): Faces => {
		if (shown?.tag === tag) return [{ at: 0, expression: shown.id }];
		let id: string | null = null;
		if (tag !== NEUTRAL_FACE_TAG) {
			const faces = expressions.filter((e) => e.tag === tag);
			const face = faces[Math.floor(Math.random() * faces.length)];
			if (!face) return [];
			id = face.id;
		}
		shown = { tag, id };
		return [{ at: 0, expression: id }];
	};

	/** `reply`: the reply so far, which holds the sentence. */
	return (sentence: SpokenSentence, reply: string): Promise<Faces> => {
		const before = reply.slice(0, sentence.start).trim().slice(-CONTEXT_CHARS);
		const state = [
			userText && `The user said: ${userText}`,
			before && `${charName}'s reply so far: ${before}`,
			`The current line: ${sentence.text}`,
		]
			.filter(Boolean)
			.join("\n\n");
		const signal = AbortSignal.any([options.signal, AbortSignal.timeout(DECIDE_TIMEOUT_MS)]);
		const decided = chooseForText(state, instructions, criteria, signal).then(
			(answer) => answer.choice,
			(error) => {
				if (!signal.aborted) console.warn("Could not choose the face:", error);
				return null;
			},
		);
		// Decided at once, picked in order, so a repeated tag keeps its face.
		const faces = previous.then(() => decided).then((tag) => (tag ? pick(tag) : []));
		previous = faces;
		return faces;
	};
}
