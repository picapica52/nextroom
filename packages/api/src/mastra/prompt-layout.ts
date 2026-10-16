// Puts the character's persona between the system prompt and the conversation, each as its
// own system message, and the post-history instructions after it. This only shapes what each
// model call is sent (every step, tool calls included): none of it is saved to the thread or
// seen by observational memory.

import type { Processor } from "@mastra/core/processors";
import { contextValue } from "./context";

export const promptLayout = {
	id: "prompt-layout",
	processLLMRequest({ prompt, requestContext }) {
		const beforeHistory = contextValue({ requestContext }, "beforeHistory") ?? [];
		const postHistory = contextValue({ requestContext }, "postHistory") ?? "";
		const head = prompt.findIndex((m) => m.role !== "system");
		const cut = head === -1 ? prompt.length : head;
		const before = beforeHistory.map((content) => ({ role: "system" as const, content }));
		const after = postHistory ? [{ role: "system" as const, content: postHistory }] : [];
		return { prompt: [...prompt.slice(0, cut), ...before, ...prompt.slice(cut), ...after] };
	},
} satisfies Processor<"prompt-layout">;
