import type { AgentSettingsPatch, AgentSettingsView } from "@nextroom/contracts";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useAgentSettings, useSaveAgentSettings } from "@/features/agent/queries";
import { qk } from "@/lib/query-keys";
import type { SetAgentSection } from "../agent-options";
import { SettingsPage } from "./settings-layout";

export type AgentSettingsForm = { form: AgentSettingsView; set: SetAgentSection };

/** The agent settings, saved as soon as a change is made. */
export function useAgentSettingsForm() {
	const qc = useQueryClient();
	const saved = useAgentSettings();
	const save = useSaveAgentSettings();
	const set: SetAgentSection = (section, changes) => {
		qc.setQueryData<AgentSettingsView>(
			qk.agentSettings(),
			(old) => old && { ...old, [section]: { ...old[section], ...changes } },
		);
		return save.mutateAsync({ [section]: changes } as AgentSettingsPatch).then(
			() => true,
			() => {
				qc.invalidateQueries({ queryKey: qk.agentSettings() });
				return false;
			},
		);
	};
	return {
		f: saved.data ? { form: saved.data, set } : undefined,
		loadError: saved.error,
		saveError: save.error,
	};
}

/** One page of the agent settings. */
export function AgentSettingsPage({ children }: { children: (f: AgentSettingsForm) => ReactNode }) {
	const { f, loadError, saveError } = useAgentSettingsForm();
	return (
		<SettingsPage loadError={f ? null : loadError} saveError={saveError}>
			{f && children(f)}
		</SettingsPage>
	);
}
