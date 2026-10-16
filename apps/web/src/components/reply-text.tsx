export interface ReplyPart {
	narration: boolean;
	text: string;
	/** Where `text` starts in the reply. */
	start: number;
}

/** Splits a reply into narration (`*…*`, not read aloud) and spoken lines. As in speech, an
 *  unclosed `*` runs to the end, so a narration being written never shows as a spoken line. */
export function replyParts(text: string): ReplyPart[] {
	let start = 0;
	return text
		.split("*")
		.map((part, i) => {
			const p = { narration: i % 2 === 1, text: part, start };
			start += part.length + 1;
			return p;
		})
		.filter((p) => p.text.trim());
}

/** `text` without its blank ends, still placed in the reply. */
function trimmed(text: string, start: number) {
	const lead = text.length - text.trimStart().length;
	return { text: text.trim(), start: start + lead };
}

/** The reply as it is laid out in bubbles: each narration whole, each spoken line on its own. */
export function replyLines(text: string): ReplyPart[] {
	return replyParts(text).flatMap((p): ReplyPart[] => {
		if (p.narration) return [{ narration: true, ...trimmed(p.text, p.start) }];
		let start = p.start;
		return p.text.split("\n").flatMap((line) => {
			const part = { narration: false, ...trimmed(line, start) };
			start += line.length + 1;
			return part.text ? [part] : [];
		});
	});
}
