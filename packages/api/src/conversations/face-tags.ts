// The face tags, like `[smile]`, that replies used to write before the Decisions API chose the
// faces. Older threads still hold them, so they are taken out of the history.

import { EXPRESSION_TAG_VALUES, MERGED_TAGS } from "@nextroom/contracts";

/** The face tag that goes back to the avatar. */
export const NEUTRAL_FACE_TAG = "neutral";

const FACE_TAG_NAMES = [NEUTRAL_FACE_TAG, ...EXPRESSION_TAG_VALUES, ...Object.keys(MERGED_TAGS)];
const FACE_TAG = new RegExp(String.raw`\[\s*(${FACE_TAG_NAMES.join("|")})\s*\]`, "gi");

/** `text` without its face tags. Other brackets are left as they are. */
export const withoutFaceTags = (text: string) => text.replace(FACE_TAG, "");
