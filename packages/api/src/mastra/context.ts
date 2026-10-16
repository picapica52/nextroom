// What every call of the character agent carries in its RequestContext, so that dynamic
// parts of the agent (its memory, tools and workspace) and the tools themselves know which
// conversation they serve.

import type { RequestContext } from "@mastra/core/request-context";
import type { AgentSettings } from "../settings/agent";
import type { LlmConnection } from "./providers";
import type { TurnReporter } from "./steps";

export type CharacterContext = {
	system: string;
	/** System messages between the system prompt and the conversation: the persona (prompt-layout). */
	beforeHistory: string[];
	/** The system message after the conversation; empty for none (prompt-layout). */
	postHistory: string;
	connection: LlmConnection;
	/** The conversation, which is also the browser session. */
	sessionId: string;
	/** The conversation's memory thread. */
	threadId: string;
	/** Also whose workspace the file tools and Claude work in. */
	characterId: string;
	settings: AgentSettings;
	reporter: TurnReporter;
	/** Shows images the reply drew (ids in the conversation's folder) with the reply. */
	addImages: (ids: string[]) => void;
};

export type WithContext = { requestContext?: RequestContext<unknown> } | undefined;

/** A value of the call's context, from a tool's execution context or a resolver's argument. */
export function contextValue<K extends keyof CharacterContext>(
	from: WithContext,
	key: K,
): CharacterContext[K] | undefined {
	return (from?.requestContext as RequestContext<CharacterContext> | undefined)?.get(key);
}

/** The id Mastra gave the tool call being run. */
export const toolCallIdOf = (context: unknown): string | undefined =>
	(context as { agent?: { toolCallId?: string } } | undefined)?.agent?.toolCallId;
