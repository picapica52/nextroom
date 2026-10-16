// PNG files. Character cards other apps embed in text chunks (`chara`, `ccv3`) are stripped
// from the images kept.

import { inflateSync } from "node:zlib";
import sharp from "sharp";

import { BadRequestError } from "../lib/errors";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CARD_CHUNKS = ["chara", "ccv3"];

export const isPng = (data: Uint8Array) =>
	data.length >= SIGNATURE.length &&
	SIGNATURE.equals(Buffer.from(data.subarray(0, SIGNATURE.length)));

interface Chunk {
	kind: string;
	body: Buffer;
	raw: Buffer;
}

function chunks(data: Uint8Array): Chunk[] {
	if (!isPng(data)) throw new BadRequestError("PNG ファイルではありません");
	const buf = Buffer.from(data);
	const out: Chunk[] = [];
	let pos = SIGNATURE.length;
	while (pos + 8 <= buf.length) {
		const length = buf.readUInt32BE(pos);
		const kind = buf.toString("latin1", pos + 4, pos + 8);
		out.push({
			kind,
			body: buf.subarray(pos + 8, pos + 8 + length),
			raw: buf.subarray(pos, pos + 12 + length),
		});
		pos += 12 + length;
		if (kind === "IEND") break;
	}
	return out;
}

/** `[keyword, text]` of a tEXt / iTXt chunk. */
function textOf({ kind, body }: Chunk): [string, string] | null {
	if (kind === "tEXt") {
		const nul = body.indexOf(0);
		return [body.toString("latin1", 0, nul), body.toString("latin1", nul + 1)];
	}
	if (kind === "iTXt") {
		const nul = body.indexOf(0);
		const key = body.toString("latin1", 0, nul);
		const compressed = body[nul + 1] === 1;
		let rest = body.subarray(nul + 3);
		rest = rest.subarray(rest.indexOf(0) + 1); // language
		rest = rest.subarray(rest.indexOf(0) + 1); // translated keyword
		return [key, (compressed ? inflateSync(rest) : rest).toString("utf8")];
	}
	return null;
}

const isCardChunk = (c: Chunk) => {
	const text = textOf(c);
	return text !== null && CARD_CHUNKS.includes(text[0].toLowerCase());
};

export function stripCardChunks(png: Uint8Array): Buffer {
	return Buffer.concat([
		SIGNATURE,
		...chunks(png)
			.filter((c) => !isCardChunk(c))
			.map((c) => c.raw),
	]);
}

export async function toPng(data: Uint8Array): Promise<Buffer> {
	if (isPng(data)) return Buffer.from(data);
	try {
		return await sharp(data).ensureAlpha().png().toBuffer();
	} catch {
		throw new BadRequestError("画像として読み込めません（PNG / JPEG / WebP に対応）");
	}
}
