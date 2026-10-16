// The observer keeps the working memory as it writes the observations: Mastra's own working
// memory extractor with the character's rules for its notes.

import { Extractor, type ExtractorRuntimeContext } from "@mastra/memory";

const RULES = [
	"Update the working memory: the character's own notes on its relationship with the user, from the observations you made.",
	"Update them when the relationship moves, something meaningful happens between the two, a promise is made or kept, or the user says something about themselves that matters. Do not record the progress of a task.",
	"Write in Japanese, as the character's own notes from its point of view, in short phrases, one per line. Keep the template's headings and fields.",
	"Record only what actually happened or what the user actually said; leave a field blank rather than guess, and do not make the relationship closer than it is.",
	"When something changes, rewrite the old entry instead of adding a second one. 今の関係, 距離感 and ユーザーへの気持ち describe the present.",
	"Start each line under 大事な出来事, 約束 and 気にかけていること with its date (YYYY-MM-DD). Remove a promise once it is kept or dropped, and a concern once it is settled; move it to 大事な出来事 if it matters to the two of them.",
	"気にかけていること is what the character wants to ask about or follow up on next time.",
	"Return the full updated Markdown working memory, keeping what is still true.",
];

async function instructions({ memory, threadId, resourceId }: ExtractorRuntimeContext) {
	const [template, current] = await Promise.all([
		memory?.getWorkingMemoryTemplate({}),
		memory && threadId ? memory.getWorkingMemory({ threadId, resourceId }) : null,
	]);
	return [
		...RULES,
		typeof template?.content === "string" ? `Working memory template:\n${template.content}` : "",
		current ? `Current working memory:\n${current}` : "",
	]
		.filter(Boolean)
		.join("\n\n");
}

/** Named as Mastra's own, which it then leaves out. */
export const workingMemoryExtractor = new Extractor<string>({
	name: "Working Memory",
	includePreviousExtraction: false,
	metadataKeyPath: false,
	instructions,
	onExtracted: async ({ current, memory, threadId, resourceId }) => {
		if (!memory || !current.trim()) return;
		await memory.updateWorkingMemory({ threadId, resourceId, workingMemory: current });
		return current;
	},
});
