// Text the LLMs write, cleaned for showing and speaking.

/** Drops `<think>…</think>` blocks that reasoning models put in the content stream. */
export class ThinkFilter {
	private static readonly OPEN = "<think>";
	private static readonly CLOSE = "</think>";
	private buf = "";
	private inside = false;

	feed(text: string): string {
		this.buf += text;
		let out = "";
		while (this.buf) {
			const tag = this.inside ? ThinkFilter.CLOSE : ThinkFilter.OPEN;
			const index = this.buf.indexOf(tag);
			if (index >= 0) {
				if (!this.inside) out += this.buf.slice(0, index);
				this.buf = this.buf.slice(index + tag.length);
				this.inside = !this.inside;
				continue;
			}
			// Hold back a possible partial tag at the end.
			let keep = 0;
			for (let n = Math.min(tag.length - 1, this.buf.length); n > 0; n--) {
				if (tag.startsWith(this.buf.slice(-n))) {
					keep = n;
					break;
				}
			}
			if (!this.inside) out += this.buf.slice(0, this.buf.length - keep);
			this.buf = this.buf.slice(this.buf.length - keep);
			break;
		}
		return out;
	}

	flush(): string {
		const rest = this.inside ? "" : this.buf;
		this.buf = "";
		return rest;
	}
}
