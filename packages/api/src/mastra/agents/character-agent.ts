// The character the user talks with. The system prompt (built from the character's persona), the
// endpoint and the agent settings come with each call, so one agent serves every
// conversation. It hears and speaks through the engine, remembers through
// Mastra's memory, and reaches for the tools the agent settings turn on: web search (Exa),
// a browser (Stagehand), files and commands in the character's workspace (a Mastra workspace),
// Claude Agent SDK, an image model on OpenRouter, the user's apps through Composio, and choices
// for the user when it needs them to decide (Mastra's ask_user).

import { Agent, type ToolsInput } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import type { CharacterContext } from "../context";
import { characterMemory } from "../memory";
import { promptLayout } from "../prompt-layout";
import { toolGuide } from "../prompts";
import { languageModel } from "../providers";
import { askUserTools } from "../tools/ask-user";
import { browserTools } from "../tools/browser";
import { claudeTools } from "../tools/claude";
import { composioTools } from "../tools/composio";
import { findTopicTools } from "../tools/find-topic";
import { imageGenTools } from "../tools/image-gen";
import { sandboxWorkspace } from "../tools/sandbox";
import { webSearchTools } from "../tools/web-search";
import { irodoriVoice } from "../voice";

export const characterAgent = new Agent<"character-agent", ToolsInput, undefined, CharacterContext>(
	{
		id: "character-agent",
		name: "Character",
		description:
			"An agent with the conversation's character as its persona; every reply is read aloud.",
		instructions: ({ requestContext }) => {
			const system = requestContext.get("system") ?? "";
			const settings = requestContext.get("settings");
			const guide = settings ? toolGuide(settings) : "";
			return guide ? `${system}\n\n${guide}` : system;
		},
		model: ({ requestContext }) => languageModel(requestContext.get("connection")),
		voice: irodoriVoice,
		inputProcessors: [promptLayout],
		memory: () => characterMemory(),
		tools: async ({ requestContext }: { requestContext: RequestContext<CharacterContext> }) => {
			const settings = requestContext.get("settings");
			if (!settings) return {};
			return {
				...webSearchTools(settings),
				...findTopicTools(settings),
				...browserTools(settings, requestContext.get("connection")),
				...claudeTools(settings),
				...imageGenTools(settings),
				...askUserTools(settings),
				...(await composioTools(settings)),
			};
		},
		workspace: ({ requestContext }: { requestContext: RequestContext<CharacterContext> }) => {
			const settings = requestContext.get("settings");
			return settings ? sandboxWorkspace(settings) : undefined;
		},
	},
);
