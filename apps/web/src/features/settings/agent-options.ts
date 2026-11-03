import type { AgentSettingsView } from "@nextroom/contracts";

/** Saves a change to some of one section of the agent settings, resolving to whether it was saved. */
export type SetAgentSection = <K extends keyof AgentSettingsView>(
	section: K,
	changes: Partial<AgentSettingsView[K]>,
) => Promise<boolean>;
