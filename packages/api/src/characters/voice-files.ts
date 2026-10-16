// A character's Voice Clone voice, in its folder:
//
//     voice/refs.json                   the reference clips (with transcripts)
//     voice/refs/ref_….wav              the clips
//     voice/reference.wav               the voice file: the clips joined in list order, or a WAV
//                                       read in; reference.voice.gguf when speech.cpp made it
//     voice/voice.json                  what is known about the voice file
//
// The speech.cpp server takes the voice file as the reference of a voice. A clip's transcript,
// filled by speech.cpp or typed by hand, is for reference only.

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import {
	type CharacterVoice,
	type CharacterVoiceRefs,
	VOICE_FILE_MAX_SECONDS,
	type VoiceFileInfo,
	type VoiceRef,
	voiceFileInfoSchema,
} from "@nextroom/contracts";
import { z } from "zod";
import { transcribe } from "../engine/asr";
import { gpuQueue } from "../engine/queue";
import { deleteUpload, uploadDir } from "../engine/uploads";
import { NO_VOICE_FILES, type VoiceFiles } from "../engine/voice";
import { joinWavs, wavInfo, wavSeconds } from "../engine/wav";
import { BadRequestError, ConflictError, messageOf, NotFoundError } from "../lib/errors";
import type { Job } from "../lib/jobs";
import { newId, now, readJson, writeJson } from "../lib/storage";
import { characterDir } from "./paths";

const clipSchema = z.object({
	id: z.string(),
	name: z.string(),
	created_at: z.number(),
	duration: z.number().nullable(),
	text: z.string().nullable().default(null),
	edited: z.boolean().default(false),
});
type Clip = z.infer<typeof clipSchema>;
const refsSchema = z.object({ clips: z.array(clipSchema) });

const voiceDir = (characterId: string) => join(characterDir(characterId), "voice");
const refsFile = (characterId: string) => join(voiceDir(characterId), "refs.json");
const clipPath = (characterId: string, clipId: string) => {
	if (!/^ref_[0-9a-f]+$/.test(clipId)) throw new NotFoundError("参照音声が見つかりません");
	return join(voiceDir(characterId), "refs", `${clipId}.wav`);
};
const infoFile = (characterId: string) => join(voiceDir(characterId), "voice.json");

/** The files the engine reads; the folder holds one of them. */
export const VOICE_MAIN_FILES = ["reference.wav", "reference.voice.gguf"] as const;
/** The voice's files besides the clips, as paths inside the character's folder. */
export const VOICE_FILES = [
	"voice/refs.json",
	...VOICE_MAIN_FILES.map((file) => `voice/${file}`),
	"voice/voice.json",
];
export const clipFilePath = (clipId: string) => `voice/refs/${clipId}.wav`;

const mainPath = (characterId: string) =>
	VOICE_MAIN_FILES.map((name) => join(voiceDir(characterId), name)).find((path) =>
		existsSync(path),
	);

/** The clips in list order, which is also the order they are joined in the voice file. */
const loadClips = (characterId: string): Clip[] =>
	[...(readJson(refsFile(characterId), refsSchema)?.clips ?? [])].sort((a, b) =>
		a.name.localeCompare(b.name),
	);
const saveClips = (characterId: string, clips: Clip[]) =>
	writeJson(refsFile(characterId), refsSchema, { clips });

function voiceFileInfo(characterId: string): VoiceFileInfo | null {
	if (!mainPath(characterId)) return null;
	try {
		return readJson(infoFile(characterId), voiceFileInfoSchema);
	} catch {
		return null;
	}
}

const clipSeconds = (clips: Clip[]) => clips.reduce((sum, c) => sum + (c.duration ?? 0), 0);

export function voiceRefs(characterId: string): CharacterVoiceRefs {
	const clips = loadClips(characterId);
	const info = voiceFileInfo(characterId);
	let status: CharacterVoiceRefs["voice_file_status"] = "missing";
	if (info && !info.clip_ids) status = "file";
	else if (info?.clip_ids) {
		const built = info.clip_ids;
		status =
			built.length === clips.length && built.every((id, i) => id === clips[i]?.id) ? "ok" : "stale";
	}
	return {
		clips,
		seconds: clipSeconds(clips),
		voice_file: info,
		voice_file_status: status,
	};
}

export function refAudioPath(characterId: string, clipId: string): string {
	const path = clipPath(characterId, clipId);
	if (!existsSync(path)) throw new NotFoundError("参照音声ファイルがありません");
	return path;
}

/** Add the WAV files of upload `uploadId` as clips. */
export function addRefs(characterId: string, uploadId: string): CharacterVoiceRefs {
	const source = uploadDir(uploadId);
	const files = readdirSync(source, { recursive: true, withFileTypes: true })
		.filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".wav"))
		.map((e) => join(e.parentPath, e.name))
		.sort();
	if (!files.length) {
		deleteUpload(uploadId);
		throw new BadRequestError("音声ファイル（WAV）がありません");
	}
	const clips = loadClips(characterId);
	mkdirSync(join(voiceDir(characterId), "refs"), { recursive: true });
	for (const file of files) {
		const clip: Clip = {
			id: newId("ref_"),
			name: relative(source, file).split(sep).join("/"),
			created_at: now(),
			duration: null,
			text: null,
			edited: false,
		};
		const target = clipPath(characterId, clip.id);
		renameSync(file, target);
		try {
			clip.duration = wavSeconds(wavInfo(readFileSync(target)));
		} catch {
			// kept without a length
		}
		clips.push(clip);
	}
	deleteUpload(uploadId);
	saveClips(characterId, clips);
	return voiceRefs(characterId);
}

export function deleteRefs(characterId: string, clipIds: string[]): CharacterVoiceRefs {
	const doomed = new Set(clipIds);
	const clips = loadClips(characterId);
	for (const clip of clips)
		if (doomed.has(clip.id)) rmSync(clipPath(characterId, clip.id), { force: true });
	saveClips(
		characterId,
		clips.filter((c) => !doomed.has(c.id)),
	);
	return voiceRefs(characterId);
}

export function updateRefText(characterId: string, clipId: string, text: string): VoiceRef {
	const clips = loadClips(characterId);
	const clip = clips.find((c) => c.id === clipId);
	if (!clip) throw new NotFoundError("参照音声が見つかりません");
	clip.text = text.trim();
	clip.edited = true;
	saveClips(characterId, clips);
	return clip;
}

async function transcribeRefs(job: Job, characterId: string, overwrite: boolean) {
	const todo = loadClips(characterId).filter((c) => overwrite || !c.text);
	const results = new Map<string, string>();
	const errors: string[] = [];
	try {
		for (const [i, clip] of todo.entries()) {
			job.checkCancelled();
			try {
				const wav = readFileSync(clipPath(characterId, clip.id));
				results.set(clip.id, await transcribe(wav, job.signal));
			} catch (error) {
				if (job.cancelled) throw error;
				errors.push(`${clip.name}: ${messageOf(error)}`);
			}
			job.update((i + 1) / todo.length, `文字起こし ${i + 1}/${todo.length}`);
		}
	} finally {
		// What finished is kept even when cancelled; clips (or the character) deleted meanwhile are
		// skipped.
		try {
			const clips = loadClips(characterId);
			for (const clip of clips) {
				const text = results.get(clip.id);
				if (text === undefined) continue;
				clip.text = text;
				clip.edited = false;
			}
			saveClips(characterId, clips);
		} catch {
			// the character is gone
		}
	}
	if (errors.length && !results.size)
		throw new ConflictError(`文字起こしに失敗しました: ${errors.slice(0, 3).join(" / ")}`);
	return { transcribed: results.size, errors };
}

export const enqueueRefTranscription = (characterId: string, overwrite: boolean): Job =>
	gpuQueue.submit(
		"ref_transcribe",
		"参照音声の文字起こし",
		(job) => transcribeRefs(job, characterId, overwrite),
		{ character_id: characterId },
	);

/** The clips as they are, for a voice cloned elsewhere (ElevenLabs). */
export function refClipFiles(characterId: string): { name: string; data: Uint8Array }[] {
	const clips = loadClips(characterId);
	if (!clips.length) throw new BadRequestError("参照音声がありません");
	return clips.map((c) => ({
		name: `${c.id}.wav`,
		data: readFileSync(clipPath(characterId, c.id)),
	}));
}

/** Write `file` as the voice file, replacing the one before. */
function writeVoiceFile(
	characterId: string,
	file: (typeof VOICE_MAIN_FILES)[number],
	data: Uint8Array,
	info: Omit<VoiceFileInfo, "bytes" | "created_at">,
): VoiceFileInfo {
	const dir = voiceDir(characterId);
	mkdirSync(dir, { recursive: true });
	const stored: VoiceFileInfo = { ...info, bytes: data.length, created_at: now() };
	writeFileSync(join(dir, `${file}.tmp`), data);
	for (const name of VOICE_MAIN_FILES) rmSync(join(dir, name), { force: true });
	renameSync(join(dir, `${file}.tmp`), join(dir, file));
	writeJson(infoFile(characterId), voiceFileInfoSchema, stored);
	return stored;
}

/** Irodori-TTS's codec rate. */
const VOICE_FILE_SAMPLE_RATE = 48000;

async function buildVoiceFile(job: Job, characterId: string) {
	const clips = loadClips(characterId);
	if (!clips.length) throw new BadRequestError("参照音声がありません");
	const seconds = clipSeconds(clips);
	if (seconds > VOICE_FILE_MAX_SECONDS)
		throw new BadRequestError(
			`音声が合計 ${Math.round(seconds)} 秒あります。ボイスファイルは合計 ${VOICE_FILE_MAX_SECONDS} 秒までなので、音声を減らしてください`,
		);
	job.update(0.1, "ボイスファイルを作成中");
	const wavs = clips.map((c) => readFileSync(clipPath(characterId, c.id)));
	job.checkCancelled();
	return writeVoiceFile(characterId, "reference.wav", joinWavs(wavs, VOICE_FILE_SAMPLE_RATE), {
		name: "参照音声",
		clip_ids: clips.map((c) => c.id),
		seconds,
	});
}

export const enqueueVoiceFile = (characterId: string): Job =>
	gpuQueue.submit(
		"ref_voice_file",
		"ボイスファイルの作成",
		(job) => buildVoiceFile(job, characterId),
		{ character_id: characterId },
	);

const magic = (data: Uint8Array) => new TextDecoder().decode(data.subarray(0, 4));

/** A voice file read in as it is: a WAV, or a .voice.gguf speech.cpp made. */
export function importVoiceFile(
	characterId: string,
	filename: string,
	data: Uint8Array,
): CharacterVoiceRefs {
	if (/\.wav$/i.test(filename) && magic(data) === "RIFF") {
		writeVoiceFile(characterId, "reference.wav", data, {
			name: filename.replace(/\.wav$/i, ""),
			clip_ids: null,
			seconds: wavSeconds(wavInfo(data)),
		});
	} else if (/\.gguf$/i.test(filename) && magic(data) === "GGUF") {
		writeVoiceFile(characterId, "reference.voice.gguf", data, {
			name: filename.replace(/(\.voice)?\.gguf$/i, ""),
			clip_ids: null,
			seconds: null,
		});
	} else throw new BadRequestError("ボイスファイル（.wav か .voice.gguf）を選んでください");
	return voiceRefs(characterId);
}

export function deleteVoiceFile(characterId: string): CharacterVoiceRefs {
	const dir = voiceDir(characterId);
	for (const name of VOICE_MAIN_FILES) rmSync(join(dir, name), { force: true });
	rmSync(infoFile(characterId), { force: true });
	return voiceRefs(characterId);
}

/** The files `voice` speaks with; a missing one is an error the conversation shows. */
export function speakFiles(characterId: string | null, voice: CharacterVoice): VoiceFiles {
	const files: VoiceFiles = { ...NO_VOICE_FILES };
	if (!characterId || voice.provider !== "irodori") return files;
	const path = mainPath(characterId);
	if (!path)
		throw new ConflictError(
			"Voice Clone のボイスファイルがありません。キャラクターの声の画面で作成してください",
		);
	files.clone_file = path;
	return files;
}

/** The clip ids a character's voice keeps, for its export. */
export const refClipIds = (characterId: string) => loadClips(characterId).map((c) => c.id);
