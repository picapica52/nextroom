// Photos the character takes in its own world and sends to the user. To the character it is a
// function of its device; the photo is drawn by the image model of the settings (images.ts), with
// the character's picture (when it is in the shot) and any of the conversation's images (those the
// user sent, or photos sent before) as references. The photos are kept with the conversation and
// shown with the reply.

import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { avatarPath } from "../../characters/paths";
import { MAX_TURN_IMAGES, readChatImage, saveChatImage } from "../../conversations/images";
import { isApiError } from "../../lib/errors";
import type { AgentSettings } from "../../settings/agent";
import { drawImages } from "../images";
import { PHOTO_FAILED } from "../prompts";
import { defineTool, type ToolSet } from "../tool";

const ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;

/** What the image model is asked for: the scene as a photo, keeping the references' look. */
function photoPrompt(scene: string, aspectRatio: string, self: boolean, others: number): string {
	const refs: string[] = [];
	if (self)
		refs.push(
			"The person in the first reference image is the one in the photo: keep their face, hair, body and art style.",
		);
	if (others)
		refs.push(
			`Use the ${self ? "other " : ""}reference image${others > 1 ? "s" : ""} for the things, clothes or places they show.`,
		);
	return [
		`A candid photo sent in a chat, with an aspect ratio of ${aspectRatio}. ${scene}`,
		...refs,
		"No text, captions or watermarks.",
	].join("\n");
}

function photoTool() {
	return defineTool({
		name: "send_photo",
		description:
			"Take a photo with your device, where you are right now, and send it to the user: a selfie, what you are eating, " +
			"the view, your outfit, and so on. The photo is shown to the user with your reply. " +
			"The device carries only your voice, so this is how you show the user anything.",
		schema: z.object({
			scene: z
				.string()
				.min(1)
				.describe(
					"What the photo shows, in English and in detail: who or what is in it, the place, the angle (selfie, mirror shot, from above), light and mood.",
				),
			self: z.boolean().describe("You appear in the photo (a selfie, or someone took it of you)."),
			reference_images: z
				.array(z.string())
				.max(MAX_TURN_IMAGES)
				.optional()
				.describe(
					"Ids (img_…) of images the user sent you or photos you sent before, when the photo should show the same things, clothes or places.",
				),
			count: z
				.number()
				.int()
				.min(1)
				.max(4)
				.optional()
				.describe("How many photos to send (1 by default)."),
			aspect_ratio: z.enum(ASPECT_RATIOS).optional().describe("3:4 by default."),
		}),
		execute: async (input, call) => {
			const { sessionId, characterId, addImages, reporter } = call.context;
			try {
				const avatar = avatarPath(characterId);
				const self = input.self && existsSync(avatar) ? readFileSync(avatar) : null;
				const others = (input.reference_images ?? []).map(
					(image) => readChatImage(sessionId, image).bytes,
				);
				const prompt = photoPrompt(input.scene, input.aspect_ratio ?? "3:4", !!self, others.length);
				const references = self ? [self, ...others] : others;
				const drawn = await Promise.all(
					Array.from({ length: input.count ?? 1 }, () =>
						drawImages(prompt, references, call.signal),
					),
				);
				const ids: string[] = [];
				for (const image of drawn.flat())
					ids.push(await saveChatImage(sessionId, image, "character"));
				addImages(ids);
				return `Sent ${ids.length} photo(s) to the user: ${ids.join(", ")}.`;
			} catch (error) {
				if (!isApiError(error)) throw error;
				// The reason is for the user (on the step); the character only hears it did not go through.
				reporter.append(call.id, error.message);
				return PHOTO_FAILED;
			}
		},
	});
}

/** The photo tool, when the agent settings turn it on. */
export function sendPhotoTools(settings: AgentSettings): ToolSet {
	if (!settings.send_photo.enabled) return {};
	const tool = photoTool();
	return { [tool.name]: tool };
}
