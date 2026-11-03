import { FISH_AUDIO_TTS_MODELS, type FishAudioVoice } from "@nextroom/contracts";
import { Hono } from "hono";
import { z } from "zod";

import { loadCharacter } from "../characters/store";
import { refClipFiles } from "../characters/voice-files";
import { BadRequestError } from "../lib/errors";
import {
	cloneFishAudioVoice,
	deleteFishAudioVoice,
	getFishAudioVoice,
	listFishAudioVoices,
	searchFishAudioVoices,
	synthesizeFishAudio,
} from "../lib/fish-audio";
import { json, ok, query } from "./inputs";

const SAMPLE_TEXT = "こんにちは。この声でお話しします。よろしくお願いしますね。";

/** `/api/fish-audio/*`: the Fish Audio voices a character's voice is chosen and made from. */
export const fishAudioRouter = new Hono()
	.get("/voices", async (c) => c.json<FishAudioVoice[]>(await listFishAudioVoices()))
	.get("/voices/search", query(z.object({ title: z.string().default("") })), async (c) =>
		c.json<FishAudioVoice[]>(await searchFishAudioVoices(c.req.valid("query").title)),
	)
	// A voice cloned from a character's reference clips (and their transcripts).
	.post(
		"/voices/clone",
		json(
			z.object({
				character_id: z.string(),
				name: z.string(),
				enhance_audio_quality: z.boolean().default(true),
			}),
		),
		async (c) => {
			const { character_id, name, enhance_audio_quality } = c.req.valid("json");
			const files = refClipFiles(loadCharacter(character_id).id);
			return c.json({ voice_id: await cloneFishAudioVoice(name, files, enhance_audio_quality) });
		},
	)
	.get("/voices/:id", async (c) =>
		c.json<FishAudioVoice>(await getFishAudioVoice(c.req.param("id"))),
	)
	.delete("/voices/:id", async (c) => {
		await deleteFishAudioVoice(c.req.param("id"));
		return c.json(ok);
	})
	// A short sentence in the voice, on `model`; kept by the browser, since each one costs credits.
	.get("/voices/:id/sample", async (c) => {
		const model = FISH_AUDIO_TTS_MODELS.find((m) => m === c.req.query("model"));
		if (!model) throw new BadRequestError("モデルを選んでください");
		const speech = await synthesizeFishAudio(
			SAMPLE_TEXT,
			{ voiceId: c.req.param("id"), model, speed: 1 },
			c.req.raw.signal,
		);
		return new Response(speech.audio as Uint8Array<ArrayBuffer>, {
			headers: { "content-type": "audio/wav", "cache-control": "private, max-age=86400" },
		});
	});
