// Writes one field of the persona: the conversation's LLM makes it up from the user's note and
// the other fields the user chose, or rewrites what the field already says.

import {
	PERSONA_FIELDS,
	type Persona,
	type PersonaGeneratedField,
	replyEffortOf,
} from "@nextroom/contracts";
import { ConflictError } from "../lib/errors";
import { generateOnce } from "../mastra";
import { connectionOf } from "../mastra/providers";
import { loadSettings } from "../settings/chat";
import { FIELD_GUIDE } from "./extract";

const LENGTH: Record<PersonaGeneratedField, string> = {
	world: "one short paragraph",
	profile: "one short paragraph",
	appearance: "two or three sentences",
	personality: "two or three sentences",
	speech: "one short paragraph, with two or three lines the character says",
	habits: "two or three sentences",
	likes: "two or three sentences",
	values: "two or three sentences",
	goals: "two or three sentences",
	worries: "two or three sentences",
	secret: "one or two sentences",
	backstory: "one short paragraph",
	relationships: "one short paragraph, a sentence or two for each person",
	love: "two or three sentences",
	daily: "one short paragraph",
	recent: "two or three sentences",
	surroundings: "two or three sentences",
	belongings: "two or three sentences",
	room: "two or three sentences",
	device: "one or two short sentences",
};

const instructionsOf = (field: PersonaGeneratedField) =>
	[
		"You write one field of a fictional character's settings for a role-play app.",
		"In the app, the character lives in a world of their own and talks with the user through a voice-call device in their room. The settings never describe a relationship with the user.",
		"",
		`The field is "${field}": ${FIELD_GUIDE[field]}`,
		"",
		"Rules:",
		"- Stay consistent with the reference settings, and fill what they leave open with details that fit them.",
		"- Follow the user's note when there is one.",
		"- When a current draft is given, rewrite it: keep what the note does not ask to change.",
		`- Keep it to ${LENGTH[field]}. Write only what the field is for, leaving the rest to the other fields.`,
		"- Write in English as plain prose. Names and words the character says keep their original wording.",
		"- Never write which language the character speaks or replies in; the app sets that elsewhere.",
		"- Answer with the field's text only: no heading, no field name, no quotes, no markdown.",
	].join("\n");

const plain = (answer: string) =>
	answer
		.trim()
		.replace(/^```\w*\n?|\n?```$/g, "")
		.trim();

export async function generatePersonaField(
	field: PersonaGeneratedField,
	note: string,
	persona: Persona,
	reference: (keyof Persona)[],
	signal?: AbortSignal,
): Promise<string> {
	const settings = loadSettings();
	const connection = connectionOf(settings);
	const references = Object.fromEntries(
		PERSONA_FIELDS.filter((k) => k !== field && reference.includes(k) && persona[k].trim()).map(
			(k) => [k, persona[k]],
		),
	);
	const current = persona[field].trim();
	const prompt = [
		Object.keys(references).length
			? `<reference_settings>\n${JSON.stringify(references, null, 1)}\n</reference_settings>`
			: "",
		current ? `<current_draft>\n${current}\n</current_draft>` : "",
		note.trim() ? `<note>\n${note.trim()}\n</note>` : "",
		`Write the "${field}" field in English.`,
	]
		.filter(Boolean)
		.join("\n\n");

	const answer = await generateOnce(connection, instructionsOf(field), prompt, {
		temperature: 0.8,
		effort: replyEffortOf(settings),
		signal,
	});
	const value = plain(answer);
	if (!value) throw new ConflictError("LLM の返答が空でした。もう一度試してください");
	return value;
}
