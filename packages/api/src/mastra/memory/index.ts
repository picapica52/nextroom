// The character's memory, kept by Mastra in _data/agent/memory.db (LibSQL). Each character has
// one conversation, which is one thread, named by the character's id:
//
// - observational memory: the thread as its recent messages plus an observation log the
//   conversation's LLM writes as older messages are compressed. The character can look behind
//   its observations with the recall tool, and search them by meaning (embedder.ts),
// - working memory: notes about the user, kept on the thread. The observer updates them as it
//   writes the observations; the reply itself does not.

import { Memory } from "@mastra/memory";

import { loadSettings } from "../../settings/chat";
import { connectionOf, languageModel } from "../providers";
import { embedder } from "./embedder";
import { withoutWorkResults } from "./observer-input";
import { WORKING_MEMORY_TEMPLATE } from "./overview";
import { memoryStore, memoryVector } from "./store";
import { workingMemoryExtractor } from "./working-memory";

/** When the character looks behind its observations, added to Mastra's own guidance. */
const RECALL_INSTRUCTIONS = [
	"Use recall when the user brings up something from your past conversations that your observations do not hold in enough detail, or when the exact details matter.",
	"Do not use it for what your observations and notes already tell you.",
	"In the reply, speak as someone who remembers: never say that you searched, looked anything up or checked a record.",
].join("\n");

export { clearMemory, memoryOverview } from "./overview";
export { memoryStore, memoryTables } from "./store";
export { characterResource, forgetThread, prepareThread } from "./thread";

/** Unobserved messages (tokens) that are compressed into observations, and observations that
 *  are condensed again: Mastra's defaults. */
const OBSERVE_TOKENS = 30_000;
const REFLECT_TOKENS = 40_000;

let memory: Memory | null = null;

export function characterMemory(): Memory {
	if (!memory) {
		memory = new Memory({
			storage: memoryStore(),
			vector: memoryVector(),
			embedder,
			options: {
				lastMessages: false,
				semanticRecall: false,
				observationalMemory: {
					// The conversation's LLM, as the chat settings name it at the time.
					model: () => languageModel(connectionOf(loadSettings())),
					observation: {
						messageTokens: OBSERVE_TOKENS,
						failurePolicy: "continue",
						manageWorkingMemory: true,
						extract: [workingMemoryExtractor],
						// Images go to the observer only when its model can see them.
						observeAttachments: "auto",
					},
					reflection: { observationTokens: REFLECT_TOKENS, failurePolicy: "continue" },
					retrieval: { vector: true, scope: "thread", instructions: RECALL_INSTRUCTIONS },
					// A gap of 10 minutes or more is marked, so the observations know when things were said.
					temporalMarkers: true,
					hooks: { beforeObservation: withoutWorkResults },
				},
				workingMemory: { enabled: true, scope: "thread", template: WORKING_MEMORY_TEMPLATE },
			},
		});
	}
	return memory;
}
