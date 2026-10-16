// Characters, with this app's own schema: a character lives in a world of its own, and talks
// with the user through a video-call device in its room that suddenly connected to theirs.

import { z } from "zod";

import { currentExpressionTag, EXPRESSION_TAG_VALUES } from "./expression-tags";
import type { JobStatus } from "./jobs";
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

/** How a generated face is drawn: bust (from the chest up) or chibi (super-deformed, full body). */
const EXPRESSION_STYLES = ["bust", "chibi"] as const;
export type ExpressionStyle = (typeof EXPRESSION_STYLES)[number];

/** A face shown on the call screen. The image is `expressions/<id>.png` in the character's folder. */
export const expressionSchema = z.object({
	id: z.string(),
	/** A value of EXPRESSION_TAGS, offered to the replies as a face tag; empty: not chosen. Tags merged
	 *  into another read as that one; others outside the list read as not chosen. */
	tag: z.string().transform(currentExpressionTag),
	/** The background was made transparent; the original is kept beside it as `<id>.orig.png`. */
	cutout: z.boolean().default(false),
	/** Made by image generation from `source` (REFERENCE_SOURCE or an expression id), to make it again. */
	generated: z
		.object({
			source: z.string(),
			prompt: z.string(),
			style: z.enum(EXPRESSION_STYLES).default("bust"),
		})
		.nullish(),
});
export type Expression = z.infer<typeof expressionSchema>;

export const expressionPatchSchema = z.object({
	tag: z.enum(EXPRESSION_TAG_VALUES).or(z.literal("")).nullish(),
});

/** The `source` of a generated face that is the character's reference image. */
export const REFERENCE_SOURCE = "reference";

/** The neutral face to make by image generation from `source` (REFERENCE_SOURCE or an expression id). */
export const neutralGenerateSchema = z.object({
	source: z.string(),
	style: z.enum(EXPRESSION_STYLES).default("bust"),
	/** Extra instructions for the image model. */
	prompt: z.string().trim().max(1000).default(""),
});
export type NeutralGenerate = z.infer<typeof neutralGenerateSchema>;

/** A face to make by image generation: `tag` drawn from `source`. */
export const expressionGenerateSchema = neutralGenerateSchema.extend({
	tag: z.enum(EXPRESSION_TAG_VALUES),
});
export type ExpressionGenerate = z.infer<typeof expressionGenerateSchema>;

/** Faces to make one after another in a job on the server, one per tag. */
export const expressionBatchSchema = expressionGenerateSchema.omit({ tag: true }).extend({
	tags: z.array(z.enum(EXPRESSION_TAG_VALUES)).min(1),
});
export type ExpressionBatch = z.infer<typeof expressionBatchSchema>;

/** A character's latest batch: `done` of the `tags` drawn and added so far. */
export interface ExpressionBatchView {
	id: string;
	status: JobStatus;
	tags: string[];
	done: number;
	error: string | null;
}

/** The tag the Decisions API chose for an expression image, with the runner-up. */
export interface ExpressionTagGuess {
	tag: string;
	probability: number;
	runner_up: { tag: string; probability: number } | null;
}

/** A character as stored. */
export const characterSchema = z.object({
	id: z.string(),
	created_at: z.number(),
	updated_at: z.number(),
	persona: personaSchema,
	/** The voice its replies are spoken with, and the model that speaks it. */
	voice: characterVoiceSchema,
	expressions: z.array(expressionSchema).default([]),
	/** The expression shown when no feeling is shown, also the character's picture. It has no tag. */
	neutral: z.string().nullable().default(null),
});
export type Character = z.infer<typeof characterSchema>;

/** A character as the API answers it. */
export type CharacterView = Character & {
	/** A neutral face is set, so the character has a picture. */
	has_avatar: boolean;
	/** The image faces are generated from, never shown as the character. */
	has_reference: boolean;
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
	created_at: number;
	updated_at: number;
}

/** One sentence spoken with a character's (possibly unsaved) voice, to try it before saving. */
export const voicePreviewSchema = z.object({
	text: z.string().trim().min(1).max(500),
	voice: characterVoiceSchema,
});
