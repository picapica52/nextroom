// What the agent drops when a character or its memory goes.

import { clearSession } from "../conversations/sessions";
import { clearMemory } from "./memory";
import { removeComputer } from "./tools/computer";
import { stopCommands } from "./tools/sandbox";

/** Everything the agent kept of the character's conversation: its memory and
 *  approvals. The workspace's files stay, as the user's work. */
export async function forgetConversation(characterId: string) {
	clearSession(characterId);
	try {
		clearMemory(characterId);
	} catch (error) {
		console.warn(`Could not clear the memory of character ${characterId}:`, error);
	}
}

/** Stops the character's commands and removes its computer, with its workspace and home. */
export async function removeComputerOf(characterId: string) {
	stopCommands(characterId);
	await removeComputer(characterId).catch((error) =>
		console.warn(`Could not remove the computer of character ${characterId}:`, error),
	);
}
