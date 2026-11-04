// The game master's tools: it makes new characters for the user and looks after the others' settings.
// Only the game master has them, whatever the settings turn on.

import { PERSONA_FIELDS, PERSONA_GENERATED_FIELDS, type Persona } from "@nextroom/contracts";
import { z } from "zod";
import { updateCharacterAgent } from "../../characters/agent";
import { FIELD_GUIDE } from "../../characters/fields";
import {
	createCharacter,
	listCharacters,
	loadCharacter,
	updateCharacter,
} from "../../characters/store";
import { defineTool, type ToolSet } from "../tool";

const WRITING = [
	"Write each field in English as plain prose; names and the lines the character says stay in Japanese.",
	"Never describe a relationship with the user, and never write which language the character speaks: the app sets those elsewhere.",
].join(" ");

const personaFields = (optionalName: boolean) =>
	z.object({
		...(optionalName
			? { name: z.string().trim().min(1).max(80).optional().describe(FIELD_GUIDE.name) }
			: {}),
		nickname: z.string().max(40).optional().describe(FIELD_GUIDE.nickname),
		...Object.fromEntries(
			PERSONA_GENERATED_FIELDS.map((key) => [
				key,
				z.string().max(4000).optional().describe(FIELD_GUIDE[key]),
			]),
		),
	}) as z.ZodType<Partial<Persona>>;

const instructions = z
	.string()
	.max(20_000)
	.optional()
	.describe(
		"Standing instructions for the character's work, in English: what it should do or take care of. Leave it out unless the user asked for something like this.",
	);

export const characterId = z.string().describe("The character's id, from list_characters.");

/** A character the game master may change: any but itself. */
export function other(id: string) {
	const character = loadCharacter(id);
	if (character.game_master) throw new Error("You cannot change your own settings with this tool.");
	return character;
}

const filled = (persona: Persona) =>
	Object.fromEntries(
		PERSONA_FIELDS.filter((key) => persona[key]).map((key) => [key, persona[key]]),
	);

const listCharactersTool = defineTool({
	name: "list_characters",
	description: "Every character the user can talk with in this app, you included.",
	schema: z.object({}),
	execute: async () =>
		listCharacters().map((c) => ({
			id: c.id,
			name: c.name,
			nickname: c.nickname,
			profile: c.profile,
			...(c.game_master ? { you: true } : {}),
		})),
});

const readCharacter = defineTool({
	name: "read_character",
	description: "One character's settings and standing instructions.",
	schema: z.object({ id: characterId }),
	execute: async ({ id }) => {
		const character = loadCharacter(id);
		return {
			id: character.id,
			persona: filled(character.persona),
			instructions: character.agent.instructions,
		};
	},
});

const createCharacterTool = defineTool({
	name: "create_character",
	description: [
		"Make a new character the user can talk with, when they ask for one. The new character has its own world and device, and the user can start talking with it right away.",
		"Fill the fields from what the user wants, and make up what they leave open so that the character feels alive and consistent. Leave a field out only when it does not fit.",
		WRITING,
	].join("\n"),
	schema: z.object({
		name: z.string().trim().min(1).max(80).describe(FIELD_GUIDE.name),
		persona: personaFields(false),
		instructions,
	}),
	changes: true,
	sequential: true,
	execute: async ({ name, persona, instructions: text }) => {
		const character = createCharacter(name, persona, { instructions: text ?? "" });
		return `Made "${character.persona.name}" (id ${character.id}). The user can now pick them in the app to talk.`;
	},
});

const updateCharacterTool = defineTool({
	name: "update_character",
	description: [
		"Change another character's settings or standing instructions, when the user asks. Only the fields given change; read the character first and rewrite a field in full.",
		WRITING,
	].join("\n"),
	schema: z.object({ id: characterId, persona: personaFields(true).optional(), instructions }),
	changes: true,
	sequential: true,
	execute: async ({ id, persona, instructions: text }) => {
		other(id);
		const character = persona ? updateCharacter(id, persona) : loadCharacter(id);
		if (text !== undefined) updateCharacterAgent(id, { instructions: text });
		return `Updated "${character.persona.name}".`;
	},
});

/** The game master's tools. */
export const characterTools = (): ToolSet =>
	Object.fromEntries(
		[listCharactersTool, readCharacter, createCharacterTool, updateCharacterTool].map((t) => [
			t.name,
			t,
		]),
	);
