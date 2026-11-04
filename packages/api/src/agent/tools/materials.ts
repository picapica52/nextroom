// The game master's tools for a character's face and voice, from the files the user puts in the
// 顔 and 声 folders of the game master's workspace (its 「ファイル」 tab). Only with a computer.

import {
	type CharacterVoice,
	ELEVENLABS_TTS_MODELS,
	FISH_AUDIO_MAX_CLONE_FILES,
	FISH_AUDIO_TTS_MODELS,
	TTS_PROVIDERS,
	VOICE_FILE_MAX_SECONDS,
} from "@nextroom/contracts";
import sharp from "sharp";
import { z } from "zod";
import { setAvatar, updateCharacter } from "../../characters/store";
import { enqueueVoiceFile, refClipFiles, replaceRefs } from "../../characters/voice-files";
import { gpuQueue } from "../../engine/queue";
import { speechModels } from "../../engine/speech-models";
import { wavInfo, wavSeconds } from "../../engine/wav";
import { cloneElevenlabsVoice } from "../../lib/elevenlabs";
import { ConflictError } from "../../lib/errors";
import { cloneFishAudioVoice } from "../../lib/fish-audio";
import { waitFor } from "../../lib/jobs";
import {
	createWorkspaceFolder,
	listWorkspaceFiles,
	workspaceAudioWav,
	workspaceFileBytes,
} from "../../workspaces/store";
import { FACE_FOLDER, VOICE_FOLDER } from "../prompts";
import { defineTool, ImageResult, type ToolSet } from "../tool";
import { irodoriVoice } from "../voice";
import { characterId, other } from "./characters";

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"];
const AUDIO_EXTS = [".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".webm"];
const MAX_VIEWED = 6;
const VIEW_SIZE = 512;

const hasExt = (path: string, exts: string[]) => exts.some((e) => path.toLowerCase().endsWith(e));

/** A path the user gave inside `folder`, as the workspace knows it. */
const inFolder = (folder: string, exts: string[]) =>
	z
		.string()
		.refine(
			(path) =>
				path.startsWith(`${folder}/`) && !path.split("/").includes("..") && hasExt(path, exts),
			`A file in ${folder}/, as list_materials gives it.`,
		);

async function ensureFolders(characterId: string) {
	for (const folder of [FACE_FOLDER, VOICE_FOLDER])
		await createWorkspaceFolder(characterId, folder).catch((error) => {
			if (!(error instanceof ConflictError)) throw error;
		});
}

/** An audio file as a WAV speech.cpp and the voice services read. */
async function wavOf(characterId: string, path: string): Promise<Uint8Array> {
	if (path.toLowerCase().endsWith(".wav")) {
		const data = await workspaceFileBytes(characterId, path);
		try {
			wavInfo(data);
			return data;
		} catch {
			// a WAV speech.cpp cannot read; ffmpeg makes it one
		}
	}
	return workspaceAudioWav(characterId, path);
}

const listMaterials = defineTool({
	name: "list_materials",
	description: `The image files in ${FACE_FOLDER}/ and the audio files in ${VOICE_FOLDER}/ of your workspace, which the user uploads for a character's face and voice. Makes the folders when they are missing.`,
	schema: z.object({}),
	execute: async (_input, call) => {
		const id = call.context.characterId;
		await ensureFolders(id);
		const files = (await listWorkspaceFiles(id)).filter((f) => !f.dir);
		return {
			faces: files
				.filter((f) => f.path.startsWith(`${FACE_FOLDER}/`) && hasExt(f.path, IMAGE_EXTS))
				.map((f) => f.path),
			voices: files
				.filter((f) => f.path.startsWith(`${VOICE_FOLDER}/`) && hasExt(f.path, AUDIO_EXTS))
				.map((f) => f.path),
		};
	},
});

const viewFaces = defineTool({
	name: "view_faces",
	description: `Look at images of ${FACE_FOLDER}/, to choose the one that suits the character.`,
	schema: z.object({
		paths: z.array(inFolder(FACE_FOLDER, IMAGE_EXTS)).min(1).max(MAX_VIEWED),
	}),
	execute: async ({ paths }, call) => {
		const images = await Promise.all(
			paths.map(async (path) => {
				const data = await workspaceFileBytes(call.context.characterId, path);
				const jpeg = await sharp(data)
					.flatten({ background: "#ffffff" })
					.resize(VIEW_SIZE, VIEW_SIZE, { fit: "inside", withoutEnlargement: true })
					.jpeg({ quality: 85 })
					.toBuffer();
				return { data: jpeg.toString("base64"), mimeType: "image/jpeg" };
			}),
		);
		return new ImageResult(`The images, in this order: ${paths.join(", ")}`, images);
	},
});

const transcribeVoices = defineTool({
	name: "transcribe_voices",
	description: `Transcribe audio files of ${VOICE_FOLDER}/, with each one's length, to choose which suit the character's voice best: clear speech of one person, without music or noise, that sounds like the character.`,
	schema: z.object({
		paths: z.array(inFolder(VOICE_FOLDER, AUDIO_EXTS)).min(1).max(30),
	}),
	sequential: true,
	execute: async ({ paths }, call) => {
		const results = [];
		for (const path of paths) {
			try {
				const wav = await wavOf(call.context.characterId, path);
				const text = await irodoriVoice.listen(wav, { signal: call.signal });
				results.push({ path, seconds: Math.round(wavSeconds(wavInfo(wav)) * 10) / 10, text });
			} catch (error) {
				if (call.signal.aborted) throw error;
				results.push({ path, error: error instanceof Error ? error.message : String(error) });
			}
		}
		return results;
	},
});

const setFace = defineTool({
	name: "set_character_face",
	description: `Make an image of ${FACE_FOLDER}/ another character's picture.`,
	schema: z.object({ id: characterId, path: inFolder(FACE_FOLDER, IMAGE_EXTS) }),
	changes: true,
	sequential: true,
	execute: async ({ id, path }, call) => {
		const character = other(id);
		await setAvatar(id, await workspaceFileBytes(call.context.characterId, path));
		return `"${character.persona.name}" now has ${path} as their picture.`;
	},
});

/** The Irodori-TTS model a voice speaks with: the given one, the one it has, or one the speech
 *  server has fetched (its recommended one first). */
async function irodoriModel(given: string | undefined, current: string): Promise<string> {
	if (given) return given;
	if (current) return current;
	const { models } = await speechModels();
	const fetched = models
		.filter((m) => m.task === "synthesis" && m.fetched)
		.sort((a, b) => Number(b.recommended) - Number(a.recommended));
	const model = fetched[0]?.name;
	if (!model)
		throw new ConflictError(
			"No Irodori-TTS model is downloaded. Ask the user to download one on the character's voice screen.",
		);
	return model;
}

const setVoice = defineTool({
	name: "set_character_voice",
	description: [
		`Give another character a voice cloned from audio files of ${VOICE_FOLDER}/: they become the character's reference clips, and the voice is made with the provider the user chose.`,
		`- irodori: Voice Clone on this app's speech server; the clips are at most ${VOICE_FILE_MAX_SECONDS} seconds together.`,
		`- elevenlabs: an ElevenLabs Instant Voice Clone. - fish_audio: a Fish Audio voice, from at most ${FISH_AUDIO_MAX_CLONE_FILES} clips.`,
		"A few clear clips of 5-20 seconds each usually work best.",
	].join("\n"),
	schema: z.object({
		id: characterId,
		provider: z.enum(TTS_PROVIDERS),
		clips: z
			.array(
				z.object({
					path: inFolder(VOICE_FOLDER, AUDIO_EXTS),
					text: z.string().describe("Its transcript from transcribe_voices, corrected if needed."),
				}),
			)
			.min(1)
			.max(30),
		model: z
			.string()
			.optional()
			.describe(
				`The speech model. elevenlabs: ${ELEVENLABS_TTS_MODELS.join(", ")}. fish_audio: ${FISH_AUDIO_TTS_MODELS.join(", ")}. irodori: leave it out. Leave it out to keep the character's or use the first.`,
			),
	}),
	changes: true,
	sequential: true,
	execute: async ({ id, provider, clips, model }, call) => {
		const character = other(id);
		if (provider === "fish_audio" && clips.length > FISH_AUDIO_MAX_CLONE_FILES)
			throw new Error(`Fish Audio takes at most ${FISH_AUDIO_MAX_CLONE_FILES} clips.`);
		const wavs = [];
		for (const [i, clip] of clips.entries()) {
			const data = await wavOf(call.context.characterId, clip.path);
			const base =
				clip.path
					.split("/")
					.at(-1)
					?.replace(/\.[^.]+$/, "") ?? "clip";
			wavs.push({ name: `${String(i + 1).padStart(2, "0")}_${base}.wav`, data, text: clip.text });
		}
		const seconds = wavs.reduce((sum, w) => sum + wavSeconds(wavInfo(w.data)), 0);
		if (provider === "irodori" && seconds > VOICE_FILE_MAX_SECONDS)
			throw new Error(
				`The clips are ${Math.round(seconds)} seconds together; Voice Clone takes at most ${VOICE_FILE_MAX_SECONDS}. Choose fewer or shorter ones.`,
			);
		const voice = character.voice;
		let patch: Partial<CharacterVoice>;
		if (provider === "irodori") {
			const irodori_model = await irodoriModel(model, voice.irodori_model);
			replaceRefs(id, wavs);
			await waitFor(gpuQueue, enqueueVoiceFile(id), call.signal);
			patch = { provider, irodori_model };
		} else {
			replaceRefs(id, wavs);
			const name = character.persona.name;
			if (provider === "elevenlabs")
				patch = {
					provider,
					elevenlabs_voice_id: await cloneElevenlabsVoice(name, refClipFiles(id), false),
					elevenlabs_model: (model ??
						(voice.elevenlabs_model ||
							ELEVENLABS_TTS_MODELS[0])) as CharacterVoice["elevenlabs_model"],
				};
			else
				patch = {
					provider,
					fish_audio_voice_id: await cloneFishAudioVoice(name, refClipFiles(id), true),
					fish_audio_model: (model ??
						(voice.fish_audio_model ||
							FISH_AUDIO_TTS_MODELS[0])) as CharacterVoice["fish_audio_model"],
				};
		}
		updateCharacter(id, null, patch);
		return `"${character.persona.name}" now speaks with a voice made from ${clips.length} clips (${Math.round(seconds)} seconds). The user can try it on the character's voice screen.`;
	},
});

/** The tools for faces and voices. */
export const materialTools = (): ToolSet =>
	Object.fromEntries(
		[listMaterials, viewFaces, transcribeVoices, setFace, setVoice].map((t) => [t.name, t]),
	);
