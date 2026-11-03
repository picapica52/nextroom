// What the agent drops when a character or its memory goes.

import { clearSession } from "../conversations/sessions";
import { loadAgentSettings } from "../settings/agent";
import { clearMemory } from "./memory";
import { closeBrowser } from "./tools/browser";
import { removeDesktop } from "./tools/desktop";
import { resetSandbox } from "./tools/sandbox";

/** Everything the agent kept of the character's conversation: its memory, browser and
 *  approvals, and the files beside it. The workspace's files stay, as the user's work. */
export async function forgetConversation(characterId: string) {
	clearSession(characterId);
	try {
		clearMemory(characterId);
	} catch (error) {
		console.warn(`Could not clear the memory of character ${characterId}:`, error);
	}
	await closeBrowser(characterId).catch(() => {});
}

/** Stops the character's sandbox container and removes its desktop, before its workspace goes
 *  with it. */
export async function stopSandbox(characterId: string) {
	await resetSandbox(characterId, loadAgentSettings()).catch((error) =>
		console.warn(`Could not stop the sandbox of character ${characterId}:`, error),
	);
	await removeDesktop(characterId).catch((error) =>
		console.warn(`Could not remove the desktop of character ${characterId}:`, error),
	);
}
