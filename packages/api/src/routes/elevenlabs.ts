import {
	ELEVENLABS_TTS_MODELS,
	type ElevenlabsVoice,
	type ElevenlabsVoicePreview,
} from "@nextroom/contracts";
import { Hono } from "hono";
import { z } from "zod";

import { loadCharacter } from "../characters/store";
import { refClipFiles } from "../characters/voice-files";
import {
	cloneElevenlabsVoice,
	deleteElevenlabsVoice,
	designElevenlabsVoices,
	listElevenlabsVoices,
	saveElevenlabsVoice,
	synthesizeElevenlabs,
} from "../lib/elevenlabs";
import { BadRequestError } from "../lib/errors";
import { json, ok } from "./inputs";

const SAMPLE_TEXT = "こんにちは。この声でお話しします。よろしくお願いしますね。";

/** `/api/elevenlabs/*`: the ElevenLabs account's voices, made and heard from a character's voice. */
export const elevenlabsRouter = new Hono()
	.get("/voices", async (c) => c.json<ElevenlabsVoice[]>(await listElevenlabsVoices()))
	// Instant Voice Clone from a character's reference clips.
	.post(
		"/voices/clone",
		json(
			z.object({
				character_id: z.string(),
				name: z.string(),
				remove_background_noise: z.boolean().default(false),
			}),
		),
		async (c) => {
			const { character_id, name, remove_background_noise } = c.req.valid("json");
			const files = refClipFiles(loadCharacter(character_id).id);
			const voiceId = await cloneElevenlabsVoice(name, files, remove_background_noise);
			return c.json({ voice_id: voiceId });
		},
	)
	.post("/voices/design", json(z.object({ description: z.string() })), async (c) =>
		c.json<ElevenlabsVoicePreview[]>(await designElevenlabsVoices(c.req.valid("json").description)),
	)
	.post(
		"/voices",
		json(z.object({ name: z.string(), description: z.string(), generated_voice_id: z.string() })),
		async (c) => {
			const { name, description, generated_voice_id } = c.req.valid("json");
			return c.json({
				voice_id: await saveElevenlabsVoice(name, description, generated_voice_id),
			});
		},
	)
	.delete("/voices/:id", async (c) => {
		await deleteElevenlabsVoice(c.req.param("id"));
		return c.json(ok);
	})
	// A short sentence in the voice, on `model`; kept by the browser, since each one costs credits.
	.get("/voices/:id/sample", async (c) => {
		const model = ELEVENLABS_TTS_MODELS.find((m) => m === c.req.query("model"));
		if (!model) throw new BadRequestError("モデルを選んでください");
		const speech = await synthesizeElevenlabs(
			SAMPLE_TEXT,
			{ voiceId: c.req.param("id"), model, speed: 1 },
			c.req.raw.signal,
		);
		return new Response(speech.audio as Uint8Array<ArrayBuffer>, {
			headers: { "content-type": "audio/wav", "cache-control": "private, max-age=86400" },
		});
	});
