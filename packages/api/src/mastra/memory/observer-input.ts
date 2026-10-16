// What the observer is shown of the conversation: the results of the work tools (the browser,
// web search and the workspace) are left out, since pages, files and command output are not
// what the character should remember. Their calls stay, so it still knows what was done.

import { type ObserverMessageTransform, skillResultRedactor } from "@mastra/memory/hooks";

const isWorkTool = (name: string) =>
	name.startsWith("stagehand_") ||
	name === "web_search" ||
	name === "find_topic" ||
	name.startsWith("mastra_workspace_");

function toolNames(messages: Parameters<ObserverMessageTransform>[0]["messages"]): string[] {
	const names = new Set<string>();
	for (const message of messages) {
		for (const part of message.content?.parts ?? []) {
			if (part.type === "tool-invocation") names.add(part.toolInvocation.toolName);
		}
	}
	return [...names].filter(isWorkTool);
}

export const withoutWorkResults: ObserverMessageTransform = (input) => {
	const names = toolNames(input.messages);
	return names.length ? skillResultRedactor({ toolNames: names })(input) : undefined;
};
