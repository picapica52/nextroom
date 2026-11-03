import type { AgentSettingsPatch, AgentSettingsView } from "@nextroom/contracts";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SettingsBody, SettingsErrorFooter } from "@/components/settings-section";
import { ErrorNote } from "@/components/status";
import { useAgentSettings, useSaveAgentSettings } from "@/features/agent/queries";
import { qk } from "@/lib/query-keys";
import type { SetAgentSection } from "../agent-options";

export type AgentSettingsForm = { form: AgentSettingsView; set: SetAgentSection };

/** One page of the agent settings. A change is saved as soon as it is made. */
export function AgentSettingsPage({ children }: { children: (f: AgentSettingsForm) => ReactNode }) {
	const qc = useQueryClient();
	const saved = useAgentSettings();
	const save = useSaveAgentSettings();
	if (!saved.data)
		return (
			<SettingsBody>
				<ErrorNote error={saved.error} />
			</SettingsBody>
		);
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

	return (
		<>
			<SettingsBody>{children({ form: saved.data, set })}</SettingsBody>
			<SettingsErrorFooter error={save.error} />
		</>
	);
}
