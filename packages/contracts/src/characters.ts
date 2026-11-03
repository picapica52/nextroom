// Characters, with this app's own schema: a character lives in a world of its own, and talks
// with the user through a voice-call device in its room that suddenly connected to theirs.

import { z } from "zod";

import { modelChoiceSchema } from "./settings";
import { characterVoiceSchema, type TtsProvider } from "./voice";

export const PERSONA_FIELDS = [
	"name",
	"nickname",
	"world",
	"profile",
	"appearance",
	"personality",
	"speech",
	"habits",
	"likes",
	"values",
	"goals",
	"worries",
	"secret",
	"backstory",
	"relationships",
	"love",
	"daily",
	"recent",
	"surroundings",
	"belongings",
	"room",
	"device",
] as const;

/** Who the character is, as the conversation's prompt tells it. */
export const personaSchema = z.object(
	Object.fromEntries(PERSONA_FIELDS.map((key) => [key, z.string().default("")])) as Record<
		(typeof PERSONA_FIELDS)[number],
		z.ZodDefault<z.ZodString>
	>,
);
export type Persona = z.infer<typeof personaSchema>;

/** A change to the persona; a missing field stays as it is. */
export const personaPatchSchema = z.object(
	Object.fromEntries(PERSONA_FIELDS.map((key) => [key, z.string().optional()])) as Record<
		(typeof PERSONA_FIELDS)[number],
		z.ZodOptional<z.ZodString>
	>,
);

/** The long fields the LLM can write one at a time. */
export const PERSONA_GENERATED_FIELDS = [
	"world",
	"profile",
	"appearance",
	"personality",
	"speech",
	"habits",
	"likes",
	"values",
	"goals",
	"worries",
	"secret",
	"backstory",
	"relationships",
	"love",
	"daily",
	"recent",
	"surroundings",
	"belongings",
	"room",
	"device",
] as const;
export type PersonaGeneratedField = (typeof PERSONA_GENERATED_FIELDS)[number];

/** `field` to write from the user's `note`, the form's `persona` (whose `field` is a draft to
 *  rewrite), and the other fields chosen as `reference`. */
export const personaGenerateSchema = z.object({
	field: z.enum(PERSONA_GENERATED_FIELDS),
	note: z.string().max(2000).default(""),
	persona: personaSchema,
	reference: z.array(z.enum(PERSONA_FIELDS)).default([]),
});

/** The name a character starts with. */
export const NEW_CHARACTER_NAME = "新しいキャラクター";

/** Source files read for the persona: by their extension, the formats taken. */
export const PERSONA_SOURCE_EXTENSIONS = [".txt", ".md", ".json"] as const;

/** The persona as the LLM read it from the user's files; a missing field was not in them. */
export interface PersonaExtract {
	persona: Partial<Persona>;
	/** Files cut short to fit the model: how many characters of each were read. */
	truncated: { name: string; read: number; total: number }[];
}

/** What a character does differently from the others: its own model and its standing
 *  instructions (added after the custom prompt of the settings). */
const characterAgentSchema = z.object({
	model: modelChoiceSchema.nullable().default(null),
	instructions: z.string().default(""),
});

export const characterAgentPatchSchema = z.object({
	model: modelChoiceSchema.nullable().optional(),
	instructions: z.string().max(20_000).optional(),
});
export type CharacterAgentPatch = z.infer<typeof characterAgentPatchSchema>;

/** An earlier version of a character's instructions, which can be restored. */
export interface InstructionRevision {
	revision: number;
	instructions: string;
	created_at: number;
}

/** A character as stored. */
export const characterSchema = z.object({
	id: z.string(),
	created_at: z.number(),
	updated_at: z.number(),
	persona: personaSchema,
	/** The voice its replies are spoken with, and the model that speaks it. */
	voice: characterVoiceSchema,
	agent: characterAgentSchema.default({ model: null, instructions: "" }),
	/** The chief, who is there from the start and makes and looks after the other characters.
	 *  There is one, and it cannot be deleted. */
	chief: z.boolean().default(false),
});
export type Character = z.infer<typeof characterSchema>;

/** A character as the API answers it. */
export type CharacterView = Character & {
	/** The character has a picture (`avatar.png` in its folder). */
	has_avatar: boolean;
};

export interface CharacterSummary {
	id: string;
	name: string;
	nickname: string;
	/** The start of its profile. */
	profile: string;
	/** What speaks it. */
	voice: TtsProvider;
	has_avatar: boolean;
	chief: boolean;
	created_at: number;
	updated_at: number;
}

/** One sentence spoken with a character's (possibly unsaved) voice, to try it before saving. */
export const voicePreviewSchema = z.object({
	text: z.string().trim().min(1).max(500),
	voice: characterVoiceSchema,
});
