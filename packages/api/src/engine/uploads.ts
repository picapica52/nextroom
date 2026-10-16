// Audio uploaded from the browser in batches, before it joins a reference set. Only WAV is
// kept (speech.cpp reads nothing else); the browser converts other formats before sending.

import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { uploadsDir } from "../lib/config";
import { BadRequestError, NotFoundError } from "../lib/errors";
import { newId, safeFileName } from "../lib/storage";
import { wavInfo } from "./wav";

const STALE_MS = 24 * 3600 * 1000;

function cleanupStale(): void {
	const root = uploadsDir();
	mkdirSync(root, { recursive: true });
	for (const name of readdirSync(root)) {
		const path = join(root, name);
		try {
			if (name.startsWith("up_") && Date.now() - statSync(path).mtimeMs > STALE_MS)
				rmSync(path, { recursive: true, force: true });
		} catch {
			// gone already
		}
	}
}

export function newUpload(): string {
	cleanupStale();
	const id = newId("up_");
	mkdirSync(join(uploadsDir(), id), { recursive: true });
	return id;
}

export function uploadDir(uploadId: string): string {
	if (!/^up_[0-9a-f]+$/.test(uploadId)) throw new BadRequestError("不正なアップロードIDです");
	const path = join(uploadsDir(), uploadId);
	try {
		if (statSync(path).isDirectory()) return path;
	} catch {
		// missing
	}
	throw new NotFoundError(`アップロードが見つかりません: ${uploadId}`);
}

/** The folder structure the browser reports, without escaping the upload's folder. */
function safeRelativePath(name: string): string[] {
	const parts = name
		.replaceAll("\\", "/")
		.split("/")
		.filter((p) => p && p !== "." && p !== "..")
		.map(safeFileName)
		.filter(Boolean);
	if (!parts.length) throw new BadRequestError(`不正なファイル名です: ${name}`);
	return parts;
}

/** Store one file; false for a file that is not a WAV speech.cpp can read, which is skipped. */
function saveUploadFile(uploadId: string, name: string, data: Uint8Array): boolean {
	const parts = safeRelativePath(name);
	if (!parts.at(-1)?.toLowerCase().endsWith(".wav")) return false;
	try {
		wavInfo(data);
	} catch {
		return false;
	}
	const target = join(uploadDir(uploadId), ...parts);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, data);
	return true;
}

/** Store a batch of files, each under its path (its own name without one), and count those
 *  saved and those skipped. */
export async function saveUploadFiles(
	uploadId: string,
	files: File[],
	paths: string[],
): Promise<{ saved: number; skipped: number }> {
	let saved = 0;
	let skipped = 0;
	for (const [i, file] of files.entries()) {
		const name = paths[i] || file.name;
		if (saveUploadFile(uploadId, name, new Uint8Array(await file.arrayBuffer()))) saved++;
		else skipped++;
	}
	return { saved, skipped };
}

export function deleteUpload(uploadId: string): void {
	rmSync(uploadDir(uploadId), { recursive: true, force: true });
}
