// What every reply of the character agent runs with, so that its tools know which conversation
// they serve.

import type { AgentSettings } from "../settings/agent";
import type { LlmConnection } from "./providers";
import type { TurnReporter } from "./steps";

export type CharacterContext = {
	/** The fixed system prompt, the custom prompt and the style prompt. */
	system: string;
	/** Between the system prompt and the conversation: the persona. */
	beforeHistory: string[];
	/** After the conversation, with the user's message; empty for none. */
	postHistory: string;
	/** The model the reply is made with, then the fallbacks to try when it fails. */
	connections: LlmConnection[];
	/** The first of them, for what the tools ask a model. */
	connection: LlmConnection;
	/** What the user asked for in this turn (or the routine's instruction), for the approvals. */
	request: string;
	/** The conversation. */
	sessionId: string;
	/** Also whose workspace the file tools work in. */
	characterId: string;
	settings: AgentSettings;
	/** The character is the game master, with the tools that make and change the other characters. */
	game_master: boolean;
	reporter: TurnReporter;
	/** Shows the photos the reply sent (ids in the conversation's folder) with the reply. */
	addImages: (ids: string[]) => void;
};
