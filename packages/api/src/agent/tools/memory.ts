// The character's own memory tool, always at hand: rewriting its notes (MEMORY.md) as the
// conversation goes.

import { z } from "zod";
import { NOTES_MAX_CHARS, NOTES_RULES, writeNotes } from "../memory/notes";
import { defineTool, type ToolSet } from "../tool";

const updateMemory = defineTool({
	name: "update_memory",
	description: [
		"Rewrite your notes (MEMORY.md), which you are given with every reply, in full.",
		"Use it when something worth remembering comes up: the user tells you about themselves, the relationship moves, a promise is made or kept, or the user asks you to remember something.",
		...NOTES_RULES,
	].join("\n"),
	schema: z.object({
		content: z
			.string()
			.min(1)
			.max(NOTES_MAX_CHARS)
			.describe("The whole new notes, in Markdown, under the same headings as now."),
	}),
	sequential: true,
	execute: async ({ content }, call) => {
		writeNotes(call.context.characterId, content, "character");
		return "Your notes are updated.";
	},
});

export const memoryTools = (): ToolSet => ({
	[updateMemory.name]: updateMemory,
});
