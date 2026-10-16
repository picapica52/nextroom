// The face the call screen shows while each part of a reply plays, chosen by the reply itself:
// told the tags of the character's expressions, the LLM writes one, like `[smile]`, before the
// words it goes with. The face stays until the next tag.

import type { Expression } from "@nextroom/contracts";
import { NEUTRAL_FACE_TAG } from "./face-tags";

/** The tags of the character's expressions; empty: the face does not change. */
export const faceTagsOf = (expressions: Expression[]) => [
	...new Set(expressions.flatMap((e) => (e.tag ? [e.tag] : []))),
];

/** What the LLM is told after the conversation, so its reply carries the faces. */
export const faceInstruction = (tags: string[]) =>
	[
		"[Facial expressions]",
		"In this voice call, your face changes with what you say. Right before the words a face goes with, " +
			"write its tag in square brackets, with nothing else inside them, and write a new tag whenever your expression changes; " +
			"the face stays until the next tag. Start each reply with a tag. Tags are neither read aloud nor shown, " +
			"so put them inside the line, never on a line of their own, and do not mention them.",
		`Tags: ${[NEUTRAL_FACE_TAG, ...tags].join(", ")}. Use ${NEUTRAL_FACE_TAG} for a calm, ordinary face, and no other tags.`,
	].join("\n");

/** The expression id for each tag the reply writes (null: the avatar; undefined: the character
 *  has no face of that tag). One of several faces with a tag is picked at random, and kept while
 *  the same tag repeats. */
export function facePicker(expressions: Expression[]) {
	let shown: { tag: string; id: string | null } | null = null;
	return (tag: string): string | null | undefined => {
		if (shown?.tag === tag) return shown.id;
		let id: string | null | undefined = null;
		if (tag !== NEUTRAL_FACE_TAG) {
			const faces = expressions.filter((e) => e.tag === tag);
			id = faces[Math.floor(Math.random() * faces.length)]?.id;
			if (id === undefined) return undefined;
		}
		shown = { tag, id };
		return id;
	};
}
