// A conversation's images, in `images/` of the character's folder: those the user attached to a turn
// and those the character drew with its image tool. Both are named by an id (img_…) that the
// agent sees, so it can hand any of them to the image tool as a reference. The user's
// attachments are noted at the end of the text the agent is given (and read back from it).

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

import { BadRequestError, NotFoundError } from "../lib/errors";
import { newId } from "../lib/storage";
import { imagesDir } from "./sessions";

/** Images one turn may carry. */
export const MAX_TURN_IMAGES = 8;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const TYPES: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
};

const ID = /^img_[0-9a-f]+$/;

/** Keeps `image` in the conversation as given when the browser can show it, else as PNG. */
export async function saveChatImage(sessionId: string, image: Uint8Array): Promise<string> {
	if (image.length > MAX_IMAGE_BYTES) throw new BadRequestError("画像は 1 枚 20 MB までです");
	let format: string | undefined;
	try {
		format = (await sharp(image).metadata()).format;
	} catch {
		throw new BadRequestError("画像として読み取れないファイルがあります");
	}
	const ext = format === "jpeg" ? "jpg" : format;
	const id = newId("img_");
	const dir = imagesDir(sessionId);
	mkdirSync(dir, { recursive: true });
	if (ext && ext in TYPES) writeFileSync(join(dir, `${id}.${ext}`), image);
	else writeFileSync(join(dir, `${id}.png`), await sharp(image).png().toBuffer());
	return id;
}

/** The image `id` of the conversation, with its content type. */
export function readChatImage(sessionId: string, id: string): { bytes: Uint8Array; type: string } {
	if (!ID.test(id)) throw new NotFoundError(`画像が見つかりません: ${id}`);
	let name: string | undefined;
	try {
		name = readdirSync(imagesDir(sessionId)).find((n) => n.startsWith(`${id}.`));
	} catch {
		/* no images yet */
	}
	if (!name) throw new NotFoundError(`画像が見つかりません: ${id}`);
	const ext = name.slice(id.length + 1);
	return {
		bytes: readFileSync(join(imagesDir(sessionId), name)),
		type: TYPES[ext] ?? "application/octet-stream",
	};
}

const NOTE = /\n*\[Attached images: ([^\]]*)\]$/;

/** The user's words as the agent is given them: with the ids of the images they attached. */
export const withImageNote = (text: string, images: string[]) =>
	images.length ? `${text}\n\n[Attached images: ${images.join(", ")}]`.trim() : text;

/** A stored user message's words and the images it carried. */
export function splitImageNote(text: string): { text: string; images: string[] } {
	const note = NOTE.exec(text);
	if (!note) return { text, images: [] };
	const images = (note[1] ?? "")
		.split(",")
		.map((id) => id.trim())
		.filter((id) => ID.test(id));
	return { text: text.slice(0, note.index).trim(), images };
}
