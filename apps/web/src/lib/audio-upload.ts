import { useRef, useState } from "react";
import { api, client, read } from "@/lib/api";
import { encodeWav } from "@/lib/recorder";

export const AUDIO_EXTS = [".wav", ".flac", ".ogg", ".mp3", ".opus"];

let decoder: AudioContext | null = null;

/** Decodes audio on one context shared by every caller, as browsers limit how many may be open. */
export function decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
	decoder ??= new AudioContext();
	return decoder.decodeAudioData(data);
}

/** The server keeps WAV only (speech.cpp reads nothing else): other formats are decoded here and
 *  sent as a mono WAV of the same name. */
async function asWav(picked: PickedFile): Promise<PickedFile> {
	if (picked.file.name.toLowerCase().endsWith(".wav")) return picked;
	try {
		const audio = await decodeAudio(await picked.file.arrayBuffer());
		const mono = new Float32Array(audio.length);
		for (let c = 0; c < audio.numberOfChannels; c++) {
			const channel = audio.getChannelData(c);
			for (let i = 0; i < mono.length; i++)
				mono[i] = (mono[i] ?? 0) + (channel[i] ?? 0) / audio.numberOfChannels;
		}
		const rename = (name: string) => name.replace(/\.[^./]+$/, ".wav");
		const file = new File([encodeWav(mono, audio.sampleRate)], rename(picked.file.name), {
			type: "audio/wav",
		});
		return { file, path: rename(picked.path) };
	} catch {
		throw new Error(`音声を読み込めません: ${picked.path}`);
	}
}
const BATCH_FILES = 50;
const BATCH_BYTES = 32 * 1024 * 1024;

export interface PickedFile {
	file: File;
	/** Path relative to the picked/dropped folder, or just the file name. */
	path: string;
}

/** Files from a file picker, each at its path in the picked folder (or by its name). */
export const pickedFiles = (files: File[]): PickedFile[] =>
	files.map((file) => ({ file, path: file.webkitRelativePath || file.name }));

/** Adds the files of an upload batch to `form`: each file under "files", its path under "paths". */
export function filesForm(files: PickedFile[], form = new FormData()) {
	for (const f of files) {
		form.append("files", f.file, f.file.name);
		form.append("paths", f.path);
	}
	return form;
}

export function isAudio(name: string) {
	const lower = name.toLowerCase();
	return AUDIO_EXTS.some((ext) => lower.endsWith(ext));
}

function readAllEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
	const reader = dir.createReader();
	const out: FileSystemEntry[] = [];
	return new Promise((resolve, reject) => {
		// readEntries returns results in chunks; keep reading until it returns none.
		const next = () =>
			reader.readEntries((batch) => {
				if (batch.length === 0) resolve(out);
				else {
					out.push(...batch);
					next();
				}
			}, reject);
		next();
	});
}

async function collectEntry(entry: FileSystemEntry, prefix: string, out: PickedFile[]) {
	if (entry.isFile) {
		const file = await new Promise<File>((resolve, reject) =>
			(entry as FileSystemFileEntry).file(resolve, reject),
		);
		out.push({ file, path: prefix + entry.name });
	} else if (entry.isDirectory) {
		for (const child of await readAllEntries(entry as FileSystemDirectoryEntry)) {
			await collectEntry(child, `${prefix}${entry.name}/`, out);
		}
	}
}

/** Files (including folder contents) from a drop; call it before the drop event's handler returns. */
export async function filesFromDrop(data: DataTransfer): Promise<PickedFile[]> {
	const entries = Array.from(data.items)
		.map((item) => item.webkitGetAsEntry())
		.filter((x): x is FileSystemEntry => x !== null);
	const out: PickedFile[] = [];
	for (const entry of entries) await collectEntry(entry, "", out);
	return out;
}

export function toBatches(files: PickedFile[]): PickedFile[][] {
	const out: PickedFile[][] = [];
	let cur: PickedFile[] = [];
	let bytes = 0;
	for (const f of files) {
		if (cur.length && (cur.length >= BATCH_FILES || bytes + f.file.size > BATCH_BYTES)) {
			out.push(cur);
			cur = [];
			bytes = 0;
		}
		cur.push(f);
		bytes += f.file.size;
	}
	if (cur.length) out.push(cur);
	return out;
}

/**
 * Send files to a new upload session in batches and hand its id to `finish`.
 * The session is deleted if anything fails or the upload is cancelled.
 */
async function uploadThen<T>(
	picked: PickedFile[],
	opts: { onProgress: (sent: number, total: number) => void; isCancelled: () => boolean },
	finish: (uploadId: string) => Promise<T>,
): Promise<T> {
	const total = picked.reduce((s, f) => s + f.file.size, 0);
	const uploads = client.engine.uploads;
	const { upload_id } = await read(uploads.$post());
	try {
		let sent = 0;
		opts.onProgress(sent, total);
		for (const batch of toBatches(picked)) {
			if (opts.isCancelled()) throw new Error("アップロードを中止しました");
			const wavs: PickedFile[] = [];
			for (const picked of batch) wavs.push(await asWav(picked));
			await api.post(`/api/engine/uploads/${upload_id}/files`, filesForm(wavs));
			sent += batch.reduce((s, f) => s + f.file.size, 0);
			opts.onProgress(sent, total);
		}
		return await finish(upload_id);
	} catch (err) {
		void read(uploads[":id"].$delete({ param: { id: upload_id } })).catch(() => undefined);
		throw err;
	}
}

/** `run` uploads files via `uploadThen` into `finish`, tracking progress; `cancel` stops it between batches. */
export function useAudioUpload<T>(finish: (uploadId: string) => Promise<T>) {
	const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
	const cancelled = useRef(false);
	const run = async (picked: PickedFile[]) => {
		cancelled.current = false;
		try {
			return await uploadThen(
				picked,
				{
					onProgress: (sent, total) => setProgress({ sent, total }),
					isCancelled: () => cancelled.current,
				},
				finish,
			);
		} finally {
			setProgress(null);
		}
	};
	const cancel = () => {
		cancelled.current = true;
	};
	return { progress, run, cancel };
}

/** Files picked for upload: audio only, de-duplicated by path. */
export function usePickedFiles() {
	const [picked, setPicked] = useState<PickedFile[]>([]);
	const [ignored, setIgnored] = useState(0);
	const add = (items: PickedFile[]) => {
		const audio = items.filter((f) => isAudio(f.file.name));
		setIgnored((n) => n + items.length - audio.length);
		setPicked((prev) => {
			const seen = new Set(prev.map((f) => f.path));
			return [...prev, ...audio.filter((f) => !seen.has(f.path))];
		});
		return audio;
	};
	const remove = (path: string) => setPicked((prev) => prev.filter((p) => p.path !== path));
	const clear = () => {
		setPicked([]);
		setIgnored(0);
	};
	const totalBytes = picked.reduce((s, f) => s + f.file.size, 0);
	return { picked, ignored, totalBytes, add, remove, clear };
}
