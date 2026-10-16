import {
	affinityPatchSchema,
	type CharacterSummary,
	expressionBatchSchema,
	expressionPatchSchema,
	neutralGenerateSchema,
	personaGenerateSchema,
	personaPatchSchema,
	personaSchema,
	voicePreviewSchema,
} from "@nextroom/contracts";
import { Hono } from "hono";
import { z } from "zod";
import { backToFriends, getAffinity, resetAffinity } from "../affinity/store";
import { exportArchive, exportName, importArchive } from "../characters/archive";
import { generateNeutral, regenerateExpression, tagExpression } from "../characters/expression-ai";
import {
	cancelExpressionBatch,
	expressionBatchOf,
	startExpressionBatch,
} from "../characters/expression-batch";
import {
	addExpression,
	clearExpressionTags,
	cutoutExpression,
	deleteExpression,
	neutralOf,
	restoreExpression,
	setNeutral,
	updateExpression,
} from "../characters/expressions";
import { extractPersona } from "../characters/extract";
import { generatePersonaField } from "../characters/generate";
import { expressionPath, referencePath } from "../characters/paths";
import { speakAs } from "../characters/speak";
import {
	createCharacter,
	deleteCharacter,
	getCharacter,
	listCharacters,
	loadCharacter,
	setReference,
	updateCharacter,
} from "../characters/store";
import { describeVoice } from "../characters/voice-description";
import {
	addRefs,
	deleteRefs,
	deleteVoiceFile,
	enqueueRefTranscription,
	enqueueVoiceFile,
	importVoiceFile,
	refAudioPath,
	updateRefText,
	voiceRefs,
} from "../characters/voice-files";
import { BadRequestError, parseOrBadRequest } from "../lib/errors";
import { forgetConversation, stopSandbox } from "../mastra/cleanup";
import { attachment, bytesOf, json, ok, sendFile } from "./inputs";

async function uploaded(c: {
	req: { parseBody: () => Promise<Record<string, unknown>> };
}): Promise<File> {
	const { file } = await c.req.parseBody();
	if (!(file instanceof File)) throw new BadRequestError("file を送ってください");
	return file;
}

export const charactersRouter = new Hono()
	.get("/", (c) => c.json<CharacterSummary[]>(listCharacters()))
	.post("/", json(z.object({ name: z.string().optional() })), (c) =>
		c.json(createCharacter(c.req.valid("json").name)),
	)
	// A character exported by this app ("/:id/export").
	.post("/import/archive", async (c) => {
		const file = await uploaded(c);
		return c.json(importArchive(await bytesOf(file)));
	})
	.get("/:id", (c) => c.json(getCharacter(c.req.param("id"))))
	.patch(
		"/:id",
		json(
			z.object({
				persona: personaPatchSchema.nullish(),
				voice: z.record(z.string(), z.unknown()).nullish(),
			}),
		),
		(c) => {
			const patch = c.req.valid("json");
			return c.json(updateCharacter(c.req.param("id"), patch.persona, patch.voice));
		},
	)
	// `files` read by the LLM into the fields of `persona` (the form's current, unsaved one),
	// with the user's `note`. Nothing is saved.
	.post("/:id/extract", async (c) => {
		loadCharacter(c.req.param("id"));
		const form = await c.req.parseBody({ all: true });
		const files = [form.files].flat().filter((f): f is File => f instanceof File);
		const note = typeof form.note === "string" ? form.note.slice(0, 2000) : "";
		const persona = parseOrBadRequest(
			personaSchema,
			JSON.parse(typeof form.persona === "string" ? form.persona : "{}"),
		);
		const sources = await Promise.all(
			files.map(async (file) => ({ name: file.name, data: await bytesOf(file) })),
		);
		return c.json(await extractPersona(sources, note, persona, c.req.raw.signal));
	})
	// One field written by the LLM from the user's note and the other fields chosen. Nothing is saved.
	.post("/:id/generate", json(personaGenerateSchema), async (c) => {
		loadCharacter(c.req.param("id"));
		const { field, note, persona, reference } = c.req.valid("json");
		return c.json({
			value: await generatePersonaField(field, note, persona, reference, c.req.raw.signal),
		});
	})
	.delete("/:id", async (c) => {
		const id = c.req.param("id");
		loadCharacter(id);
		await stopSandbox(id);
		deleteCharacter(id);
		await forgetConversation(id);
		return c.json(ok);
	})
	.get("/:id/affinity", (c) => {
		const id = c.req.param("id");
		loadCharacter(id);
		return c.json(getAffinity(id));
	})
	// Only back to friends: becoming lovers happens in the conversation.
	.patch("/:id/affinity", json(affinityPatchSchema), (c) => {
		const id = c.req.param("id");
		loadCharacter(id);
		return c.json(backToFriends(id));
	})
	.delete("/:id/affinity", (c) => {
		const id = c.req.param("id");
		loadCharacter(id);
		return c.json(resetAffinity(id));
	})
	// The character's picture: its neutral face.
	.get("/:id/avatar", (c) => {
		const id = c.req.param("id");
		return sendFile(expressionPath(id, neutralOf(loadCharacter(id)).id));
	})
	.put("/:id/avatar", async (c) => {
		const file = await uploaded(c);
		return c.json(await addExpression(c.req.param("id"), await bytesOf(file), true));
	})
	.post("/:id/avatar/generate", json(neutralGenerateSchema), async (c) =>
		c.json(await generateNeutral(c.req.param("id"), c.req.valid("json"), c.req.raw.signal)),
	)
	.delete("/:id/avatar", (c) => c.json(setNeutral(c.req.param("id"), null)))
	.get("/:id/reference", (c) => sendFile(referencePath(c.req.param("id"))))
	.put("/:id/reference", async (c) => {
		const file = await uploaded(c);
		return c.json(await setReference(c.req.param("id"), await bytesOf(file)));
	})
	.post("/:id/expressions", async (c) => {
		const file = await uploaded(c);
		return c.json(await addExpression(c.req.param("id"), await bytesOf(file)));
	})
	// Before "/:id/expressions/:eid", which would take "batch" as a face's id.
	.get("/:id/expressions/batch", (c) => c.json(expressionBatchOf(c.req.param("id"))))
	.post("/:id/expressions/batch", json(expressionBatchSchema), (c) =>
		c.json(startExpressionBatch(c.req.param("id"), c.req.valid("json"))),
	)
	.post("/:id/expressions/batch/cancel", (c) => c.json(cancelExpressionBatch(c.req.param("id"))))
	.delete("/:id/expression-tags", (c) => c.json(clearExpressionTags(c.req.param("id"))))
	.get("/:id/expressions/:eid", (c) =>
		sendFile(expressionPath(c.req.param("id"), c.req.param("eid"))),
	)
	.patch("/:id/expressions/:eid", json(expressionPatchSchema), (c) =>
		c.json(updateExpression(c.req.param("id"), c.req.param("eid"), c.req.valid("json"))),
	)
	.delete("/:id/expressions/:eid", (c) =>
		c.json(deleteExpression(c.req.param("id"), c.req.param("eid"))),
	)
	.post("/:id/expressions/:eid/cutout", async (c) =>
		c.json(await cutoutExpression(c.req.param("id"), c.req.param("eid"), c.req.raw.signal)),
	)
	.put("/:id/expressions/:eid/neutral", (c) =>
		c.json(setNeutral(c.req.param("id"), c.req.param("eid"))),
	)
	.delete("/:id/expressions/:eid/cutout", (c) =>
		c.json(restoreExpression(c.req.param("id"), c.req.param("eid"))),
	)
	.post("/:id/expressions/:eid/tag", async (c) =>
		c.json(await tagExpression(c.req.param("id"), c.req.param("eid"), c.req.raw.signal)),
	)
	.post("/:id/expressions/:eid/regenerate", async (c) =>
		c.json(await regenerateExpression(c.req.param("id"), c.req.param("eid"), c.req.raw.signal)),
	)
	// The reference clips of Voice Clone and the voice file made from them.
	.get("/:id/voice/refs", (c) => c.json(voiceRefs(loadCharacter(c.req.param("id")).id)))
	.post("/:id/voice/refs", json(z.object({ upload_id: z.string() })), (c) =>
		c.json(addRefs(loadCharacter(c.req.param("id")).id, c.req.valid("json").upload_id)),
	)
	.post("/:id/voice/refs/delete", json(z.object({ ids: z.array(z.string()) })), (c) =>
		c.json(deleteRefs(loadCharacter(c.req.param("id")).id, c.req.valid("json").ids)),
	)
	.post(
		"/:id/voice/refs/transcribe",
		json(z.object({ overwrite: z.boolean().default(false) })),
		(c) => {
			const id = loadCharacter(c.req.param("id")).id;
			return c.json(enqueueRefTranscription(id, c.req.valid("json").overwrite).view());
		},
	)
	.patch("/:id/voice/refs/:rid", json(z.object({ text: z.string() })), (c) =>
		c.json(
			updateRefText(
				loadCharacter(c.req.param("id")).id,
				c.req.param("rid"),
				c.req.valid("json").text,
			),
		),
	)
	.get("/:id/voice/refs/:rid/audio", (c) =>
		sendFile(refAudioPath(loadCharacter(c.req.param("id")).id, c.req.param("rid"))),
	)
	.post("/:id/voice/file", (c) =>
		c.json(enqueueVoiceFile(loadCharacter(c.req.param("id")).id).view()),
	)
	// A voice file read in as it is, in place of one made from the clips.
	.put("/:id/voice/file", async (c) => {
		const id = loadCharacter(c.req.param("id")).id;
		const file = await uploaded(c);
		return c.json(importVoiceFile(id, file.name, await bytesOf(file)));
	})
	.delete("/:id/voice/file", (c) => c.json(deleteVoiceFile(loadCharacter(c.req.param("id")).id)))
	// A Voice Design description written by the LLM from the saved persona. Nothing is saved.
	.post("/:id/voice/describe", async (c) =>
		c.json({
			value: await describeVoice(loadCharacter(c.req.param("id")).persona, c.req.raw.signal),
		}),
	)
	// One sentence with the (possibly unsaved) voice.
	.post("/:id/voice/preview", json(voicePreviewSchema), async (c) => {
		const { text, voice } = c.req.valid("json");
		const id = loadCharacter(c.req.param("id")).id;
		const speech = await speakAs(id, voice, text, c.req.raw.signal);
		return new Response(speech.wav as Uint8Array<ArrayBuffer>, {
			headers: {
				"content-type": "audio/wav",
				"x-duration": String(speech.duration),
				"x-seed": String(speech.seed),
			},
		});
	})
	// The whole character as a zip, for "/import/archive".
	.get("/:id/export", (c) => {
		const id = c.req.param("id");
		const data = exportArchive(id);
		return c.body(data as Uint8Array<ArrayBuffer>, 200, {
			"content-type": "application/zip",
			"content-disposition": attachment(`${exportName(id)}.character.zip`),
		});
	});
