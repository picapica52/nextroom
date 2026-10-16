import type { AgentSettingsPatch, AgentSettingsView } from "@nextroom/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { SettingsBody, SettingsErrorFooter } from "@/components/settings-section";
import { ErrorNote } from "@/components/status";
import { useAgentSettings, useDockerStatus, useSaveAgentSettings } from "@/features/agent/queries";
import { qk } from "@/lib/query-keys";
import type { SetAgentSection } from "../agent-options";
import { AgentApprovalsSection } from "./agent-approvals-section";
import { AgentToolsSection } from "./agent-tools-section";

/** What the character agent may do: its tools (browser, files and commands, Claude) and
 *  when they ask first. A change is saved as soon as it is made. */
export default function AgentSettingsPage() {
	const qc = useQueryClient();
	const saved = useAgentSettings();
	const save = useSaveAgentSettings();
	const docker = useDockerStatus();
	if (!saved.data)
		return (
			<SettingsBody>
				<ErrorNote error={saved.error} />
			</SettingsBody>
		);
	const form = saved.data;
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
			<SettingsBody>
				<AgentToolsSection
					form={form}
					set={set}
					docker={docker.data}
					hasApiKey={form.claude.has_api_key}
				/>
				<AgentApprovalsSection form={form} set={set} />
			</SettingsBody>
			<SettingsErrorFooter error={save.error} />
		</>
	);
}
