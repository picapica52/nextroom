// Fills the persona from the user's own files (settings notes, a story's text, JSON of any shape):
// the conversation's LLM reads them and writes each field of this app's schema.

import {
	PERSONA_FIELDS,
	PERSONA_SOURCE_EXTENSIONS,
	type Persona,
	type PersonaExtract,
} from "@nextroom/contracts";
import { generateOnce } from "../agent";
import { replyConnections } from "../agent/providers";
import { BadRequestError, ConflictError } from "../lib/errors";
import { jsonObjectOf } from "../lib/text";
import { loadSettings } from "../settings/chat";
import { FIELD_GUIDE } from "./fields";

/** Characters of the files the model reads in all; the rest is cut. */
const SOURCE_BUDGET = 150_000;

export interface SourceFile {
	name: string;
	data: Uint8Array;
}

const INSTRUCTIONS = [
	"You read source material about a fictional character and write that character's settings for a role-play app.",
	"In the app, the character lives in a world of their own and talks with the user through a voice-call device in their room. The settings never describe a relationship with the user.",
	"",
	"Fields:",
	...PERSONA_FIELDS.map((key) => `- ${key}: ${FIELD_GUIDE[key]}`),
	"",
	"Rules:",
	"- Use only what the sources say or clearly imply. Leave a field out when the sources say nothing about it, except device: when the sources say nothing about it, make it up to fit the character's world.",
	"- When the sources hold several characters, write the one the user's note names; without a note, the most central one.",
	"- Follow the user's note when it asks for something about the settings.",
	"- Write every field in English as plain prose, translating when the sources are in another language. Names and words the character says keep their original wording.",
	"- Never write which language the character speaks or replies in; the app sets that elsewhere.",
	"- Answer with one JSON object whose keys are field names and whose values are strings, and nothing else.",
].join("\n");

const extensionOf = (name: string) => {
	const dot = name.lastIndexOf(".");
	return dot < 0 ? "" : name.slice(dot).toLowerCase();
};

function decode(data: Uint8Array): string {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(data);
	} catch {
		return new TextDecoder("shift_jis").decode(data);
	}
}

/** The file's text as the model reads it. */
function textOf(file: SourceFile): string {
	const extension = extensionOf(file.name);
	if (!(PERSONA_SOURCE_EXTENSIONS as readonly string[]).includes(extension))
		throw new BadRequestError(
			`${file.name} は読み取れません（${PERSONA_SOURCE_EXTENSIONS.join(" / ")} のみ）`,
		);
	const text = decode(file.data).replace(/^﻿/, "");
	if (extension !== ".json") return text.trim();
	try {
		return JSON.stringify(JSON.parse(text), null, 1);
	} catch {
		throw new BadRequestError(`${file.name} を JSON として読めません`);
	}
}

/** The model's answer as fields, keeping only non-empty strings of the persona's fields. */
function personaOf(answer: string): Partial<Persona> {
	const data = jsonObjectOf(answer);
	if (data === undefined)
		throw new ConflictError("LLM の返答を JSON として読めませんでした。もう一度試してください");
	const out: Partial<Persona> = {};
	if (data && typeof data === "object")
		for (const key of PERSONA_FIELDS) {
			const value = (data as Record<string, unknown>)[key];
			if (typeof value === "string" && value.trim()) out[key] = value.trim();
		}
	return out;
}

export async function extractPersona(
	files: SourceFile[],
	note: string,
	current: Persona,
	signal?: AbortSignal,
): Promise<PersonaExtract> {
	if (files.length === 0) throw new BadRequestError("ファイルを選んでください");
	const settings = loadSettings();
	const connection = replyConnections(settings);

	const truncated: PersonaExtract["truncated"] = [];
	const sources: string[] = [];
	let left = SOURCE_BUDGET;
	for (const file of files) {
		const text = textOf(file);
		const read = Math.min(text.length, left);
		if (read < text.length) truncated.push({ name: file.name, read, total: text.length });
		if (read > 0) sources.push(`<source name="${file.name}">\n${text.slice(0, read)}\n</source>`);
		left -= read;
	}

	const filled = PERSONA_FIELDS.filter((key) => current[key].trim());
	const prompt = [
		...sources,
		note.trim() ? `<note>\n${note.trim()}\n</note>` : "",
		filled.length
			? `<current_settings>\n${JSON.stringify(Object.fromEntries(filled.map((k) => [k, current[k]])), null, 1)}\n</current_settings>\nThe current settings may be placeholders; the sources come first.`
			: "",
		"Write the character's settings as JSON, every field in English.",
	]
		.filter(Boolean)
		.join("\n\n");

	const answer = await generateOnce(connection, INSTRUCTIONS, prompt, {
		temperature: 0.3,
		signal,
	});
	return { persona: personaOf(answer), truncated };
}
