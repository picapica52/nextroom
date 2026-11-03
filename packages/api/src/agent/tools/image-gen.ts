// Photos the character takes in its own world and sends to the user. To the character it is a
// function of its device; the photo is drawn by an image model through OpenRouter, with the character's neutral face
// (when it is in the shot) and any of the conversation's images (those the user sent, or photos
// sent before) as references. The photos are kept with the conversation and shown with the reply,
// and copied to the workspace's `photos/character/`.

import { IMAGE_ASPECT_RATIOS } from "@nextroom/contracts";
import { z } from "zod";
import { originalImage } from "../../characters/expressions";
import { loadCharacter } from "../../characters/store";
import { MAX_TURN_IMAGES, readChatImage, saveChatImage } from "../../conversations/images";
import { drawWithOpenrouter } from "../../images/client";
import { BadRequestError, isApiError } from "../../lib/errors";
import type { AgentSettings } from "../../settings/agent";
import { loadSettings } from "../../settings/chat";
import { PHOTO_FAILED } from "../prompts";
import { defineTool, type ToolSet } from "../tool";

/** What the image model is asked for: the scene as a photo, keeping the references' look. */
function photoPrompt(scene: string, self: boolean, others: number): string {
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
		`A candid photo sent in a chat. ${scene}`,
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
			aspect_ratio: z.enum(IMAGE_ASPECT_RATIOS).optional().describe("3:4 by default."),
		}),
		execute: async (input, call) => {
			const { sessionId, characterId, addImages, reporter } = call.context;
			const { id } = call;
			try {
				const model = loadSettings().image_gen_model;
				if (!model)
					throw new BadRequestError("設定 → モデル で 画像の生成 のモデルを選んでください");
				const neutral = input.self ? loadCharacter(characterId).neutral : null;
				const self = neutral ? originalImage(characterId, neutral) : null;
				const others = (input.reference_images ?? []).map(
					(image) => readChatImage(sessionId, image).bytes,
				);
				const drawn = await drawWithOpenrouter(
					{
						model,
						prompt: photoPrompt(input.scene, !!self, others.length),
						references: self ? [self, ...others] : others,
						n: input.count ?? 1,
						aspectRatio: input.aspect_ratio ?? "3:4",
					},
					call.signal,
				);
				const ids: string[] = [];
				for (const image of drawn) ids.push(await saveChatImage(sessionId, image, "character"));
				addImages(ids);
				return `Sent ${ids.length} photo(s) to the user: ${ids.join(", ")}.`;
			} catch (error) {
				if (!isApiError(error)) throw error;
				// The reason is for the user (on the step); the character only hears it did not go through.
				reporter.append(id, error.message);
				return PHOTO_FAILED;
			}
		},
	});
}

/** The photo tool, when the agent settings turn it on. */
export function imageGenTools(settings: AgentSettings): ToolSet {
	if (!settings.image_gen.enabled) return {};
	const tool = photoTool();
	return { [tool.name]: tool };
}
