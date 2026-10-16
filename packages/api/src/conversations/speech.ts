// Turning a streamed reply into sentences that can be read aloud.

// Only a line break or narration ends a sentence. A line too long to synthesize in one go is cut
// at the last terminator that fits, then at a comma.
const TERMINATORS = "。！？!?.…」』）";
const COMMAS = "、，, ";

/** A sentence to read aloud, and where it is in the reply. */
export interface SpokenSentence {
	text: string;
	start: number;
	end: number;
}

/** Finds the sentences to read aloud in a streaming reply, each with where it is in the reply.
 *  Narration (`*…*`) is left out; an unclosed `*` runs to the end. A line shorter than `minChars`
 *  joins the next line, but never across narration. */
export class SpokenSentences {
	/** How far into the reply has been read. */
	private read = 0;
	private inside = false;
	/** Where the sentence being gathered starts; -1 when there is none. */
	private start = -1;

	constructor(
		private readonly minChars = 6,
		private readonly maxChars = 120,
	) {}

	/** `reply`: the whole reply so far, which only grows. Returns the sentences completed in it. */
	feed(reply: string): SpokenSentence[] {
		const out: SpokenSentence[] = [];
		for (; this.read < reply.length; this.read++) {
			const i = this.read;
			const ch = reply[i] ?? "";
			if (ch === "*") {
				if (!this.inside) this.close(reply, i, out);
				this.inside = !this.inside;
				continue;
			}
			if (this.inside) continue;
			if (this.start < 0) {
				if (ch.trim()) this.start = i;
			} else if (ch === "\n") {
				if (reply.slice(this.start, i).trim().length >= this.minChars) this.close(reply, i, out);
			} else if (i + 1 - this.start > this.maxChars) {
				const piece = reply.slice(this.start, this.start + this.maxChars);
				const lastOf = (chars: string) => Math.max(...[...chars].map((c) => piece.lastIndexOf(c)));
				const found = Math.max(lastOf(TERMINATORS), 0) || lastOf(COMMAS);
				const cut = this.start + (found > 0 ? found + 1 : this.maxChars);
				this.close(reply, cut, out);
				this.read = cut - 1;
			}
		}
		return out;
	}

	/** The rest of the reply as it is; what follows starts outside narration. */
	flush(reply: string): SpokenSentence[] {
		const out = this.feed(reply);
		this.close(reply, reply.length, out);
		this.inside = false;
		return out;
	}

	private close(reply: string, end: number, out: SpokenSentence[]) {
		let start = this.start;
		this.start = -1;
		if (start < 0) return;
		let stop = end;
		while (start < stop && !reply[start]?.trim()) start++;
		while (stop > start && !reply[stop - 1]?.trim()) stop--;
		if (start < stop) out.push({ text: reply.slice(start, stop), start, end: stop });
	}
}

const CODE_BLOCK = /```[\s\S]*?(```|$)/g;
const LINK = /\[([^\]]*)\]\([^)]*\)/g;
const URL_PATTERN = /https?:\/\/\S+/g;
const LINE_MARK = /^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)/gm;
const INLINE_MARK = /(\*\*|__|\*|`|~~)/g;

/** Strip Markdown and URLs that a chat model may emit but that should not be read aloud. */
export function speakable(text: string): string {
	const plain = text
		.replace(CODE_BLOCK, "")
		.replace(LINK, "$1")
		.replace(URL_PATTERN, "")
		.replace(LINE_MARK, "")
		.replace(INLINE_MARK, "")
		.replace(/\s+/g, " ")
		.trim();
	// Nothing left but punctuation/symbols: no point synthesizing.
	return /[\p{L}\p{N}_]/u.test(plain) ? plain : "";
}
