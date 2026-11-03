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
	connection: LlmConnection;
	/** The conversation, which is also the browser session. */
	sessionId: string;
	/** Also whose workspace the file tools work in. */
	characterId: string;
	settings: AgentSettings;
	reporter: TurnReporter;
	/** Shows images the reply drew (ids in the conversation's folder) with the reply. */
	addImages: (ids: string[]) => void;
};
