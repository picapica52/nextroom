// What every reply of the character agent runs with, so that its tools know which conversation
// they serve.

import type { ToolGroup } from "@nextroom/contracts";
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
	/** The first of them, for what the tools ask a model (reading a page). */
	connection: LlmConnection;
	/** What the user asked for in this turn (or the routine's instruction), for the approvals. */
	request: string;
	/** The conversation, which is also the browser session. */
	sessionId: string;
	/** Also whose workspace the file tools work in. */
	characterId: string;
	settings: AgentSettings;
	/** The groups of tools this character does without. */
	disabledTools: ToolGroup[];
	reporter: TurnReporter;
	/** Shows images the reply drew (ids in the conversation's folder) with the reply. */
	addImages: (ids: string[]) => void;
};
