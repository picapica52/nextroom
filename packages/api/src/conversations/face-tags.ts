// The face tags a reply writes, like `[smile]`: taken out of its text, with where they were.

import { currentExpressionTag, EXPRESSION_TAG_VALUES, MERGED_TAGS } from "@nextroom/contracts";

/** The face tag that goes back to the avatar. */
export const NEUTRAL_FACE_TAG = "neutral";

const FACE_TAG_NAMES = [NEUTRAL_FACE_TAG, ...EXPRESSION_TAG_VALUES, ...Object.keys(MERGED_TAGS)];
const FACE_TAG = new RegExp(String.raw`\[\s*(${FACE_TAG_NAMES.join("|")})\s*\]`, "gi");

/** A face tag the reply wrote, like `[smile]`, and where it was in the text without the tags. */
export interface FaceMark {
	at: number;
	/** NEUTRAL_FACE_TAG or an ExpressionTag. */
	tag: string;
}

/** `text` without its face tags, and where they were. Other brackets are left as they are. */
export function pullFaceTags(text: string): { text: string; marks: FaceMark[] } {
	const marks: FaceMark[] = [];
	let out = "";
	let last = 0;
	for (const m of text.matchAll(FACE_TAG)) {
		out += text.slice(last, m.index);
		last = m.index + m[0].length;
		const name = (m[1] ?? "").toLowerCase();
		const tag = name === NEUTRAL_FACE_TAG ? name : currentExpressionTag(name);
		if (tag) marks.push({ at: out.length, tag });
	}
	return { text: out + text.slice(last), marks };
}

export const withoutFaceTags = (text: string) => pullFaceTags(text).text;
