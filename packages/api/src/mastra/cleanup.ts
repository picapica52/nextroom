// What the agent drops when a character or its memory goes.

import { clearSession } from "../conversations/sessions";
import { loadAgentSettings } from "../settings/agent";
import { characterMemory, clearMemory } from "./memory";
import { forgetSession } from "./steps";
import { closeBrowser } from "./tools/browser";
import { resetSandbox } from "./tools/sandbox";

/** Everything the agent kept of the character's conversation: its thread, browser and
 *  approvals, and the files beside it. The workspace's files stay, as the user's work. */
export async function forgetConversation(characterId: string) {
	clearSession(characterId);
	forgetSession(characterId);
	await Promise.allSettled([
		clearMemory(characterMemory(), characterId).catch((error) =>
			console.warn(`Could not clear the memory of character ${characterId}:`, error),
		),
		closeBrowser(characterId),
	]);
}

/** Stops the character's sandbox container, before its workspace goes with it. */
export async function stopSandbox(characterId: string) {
	await resetSandbox(characterId, loadAgentSettings()).catch((error) =>
		console.warn(`Could not stop the sandbox of character ${characterId}:`, error),
	);
}
