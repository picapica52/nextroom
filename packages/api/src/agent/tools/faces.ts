// The game master's tools for a character's picture: drawn by the image model of the settings
// from the character's persona and shown in the conversation, or an image of the 顔 folder of
// its workspace (materials.ts).

import sharp from "sharp";
import { z } from "zod";
import { setAvatar } from "../../characters/store";
import { MAX_TURN_IMAGES, readChatImage, saveChatImage } from "../../conversations/images";
import { workspaceFileBytes } from "../../workspaces/store";
import { drawImages } from "../images";
import { FACE_FOLDER } from "../prompts";
import { defineTool, ImageResult, type ToolSet } from "../tool";
import { characterId, other } from "./characters";
import { IMAGE_EXTS, inFolder } from "./materials";

const VIEW_SIZE = 512;
const imageId = z.string().regex(/^img_[0-9a-f]+$/);

function facePrompt(
	persona: { name: string; world: string; profile: string; appearance: string },
	style: string,
	note: string | undefined,
	references: number,
): string {
	return [
		"A character portrait for a chat app's profile picture, square (1:1): one person, head and shoulders, facing the viewer, a simple background that suits them.",
		`Style: ${style}.`,
		persona.appearance && `Appearance: ${persona.appearance}`,
		persona.profile && `Who they are: ${persona.profile}`,
		persona.world && `Their world: ${persona.world}`,
		note,
		references
			? "Keep the look of the reference image(s): the face, hair and art style the user wants."
			: "",
		"No text, captions or watermarks.",
	]
		.filter(Boolean)
		.join("\n");
}

const drawFace = defineTool({
	name: "draw_face",
	description:
		"Draw candidates for another character's picture with the image model, from their persona (appearance, profile and world). " +
		"The images are shown to the user in the conversation, and you see them too; set the one the user picks with set_character_face.",
	schema: z.object({
		id: characterId,
		style: z
			.string()
			.min(1)
			.describe(
				"The art style, in English, as the user wants it: e.g. anime illustration, watercolor, photorealistic.",
			),
		note: z
			.string()
			.optional()
			.describe("Anything else for this picture, in English: expression, clothes, pose, colors."),
		reference_images: z
			.array(imageId)
			.max(MAX_TURN_IMAGES)
			.optional()
			.describe(
				"Ids (img_…) of images in this conversation to keep the look of: ones the user sent, or candidates drawn before.",
			),
		count: z
			.number()
			.int()
			.min(1)
			.max(4)
			.optional()
			.describe("How many candidates (2 by default)."),
	}),
	sequential: true,
	execute: async ({ id, style, note, reference_images, count }, call) => {
		const { persona } = other(id);
		const { sessionId, addImages } = call.context;
		const references = (reference_images ?? []).map(
			(image) => readChatImage(sessionId, image).bytes,
		);
		const prompt = facePrompt(persona, style, note, references.length);
		const drawn = (
			await Promise.all(
				Array.from({ length: count ?? 2 }, () => drawImages(prompt, references, call.signal)),
			)
		).flat();
		const ids: string[] = [];
		const images: { data: string; mimeType: string }[] = [];
		for (const image of drawn) {
			ids.push(await saveChatImage(sessionId, image, "character"));
			const jpeg = await sharp(image)
				.flatten({ background: "#ffffff" })
				.resize(VIEW_SIZE, VIEW_SIZE, { fit: "inside", withoutEnlargement: true })
				.jpeg({ quality: 85 })
				.toBuffer();
			images.push({ data: jpeg.toString("base64"), mimeType: "image/jpeg" });
		}
		addImages(ids);
		return new ImageResult(
			`Drew ${ids.length} candidate(s) for "${persona.name}", shown to the user in this order: ${ids.join(", ")}. Do not repeat the ids to the user.`,
			images,
		);
	},
});

const setFace = defineTool({
	name: "set_character_face",
	description: `Make an image another character's picture: a candidate drawn with draw_face or an image in this conversation (image), or a file of ${FACE_FOLDER}/ in your workspace (path).`,
	schema: z.object({
		id: characterId,
		image: imageId.optional().describe("An image of this conversation (img_…)."),
		path: inFolder(FACE_FOLDER, IMAGE_EXTS).optional(),
	}),
	changes: true,
	sequential: true,
	execute: async ({ id, image, path }, call) => {
		const character = other(id);
		const { sessionId, characterId: own } = call.context;
		if (!image === !path) throw new Error("Give either image or path.");
		const bytes = image
			? readChatImage(sessionId, image).bytes
			: await workspaceFileBytes(own, path as string);
		await setAvatar(id, bytes);
		return `"${character.persona.name}" has the new picture now.`;
	},
});

/** The tools for a character's picture. */
export const faceTools = (): ToolSet =>
	Object.fromEntries([drawFace, setFace].map((t) => [t.name, t]));
