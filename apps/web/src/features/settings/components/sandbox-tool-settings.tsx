import type { AgentSettingsView } from "@nextroom/contracts";
import type { ReactNode } from "react";
import { SaveInput } from "@/components/save-field";
import type { SetAgentSection } from "../agent-options";
import { NumberField, Segmented, SwitchRow } from "./settings-fields";
import { SettingsDisclosure, SettingsInset, SettingsRow } from "./settings-layout";

export function SandboxToolSettings({
	sandbox,
	dockerRow,
	set,
}: {
	sandbox: AgentSettingsView["sandbox"];
	/** Whether Docker answers, as a row. */
	dockerRow: ReactNode;
	set: SetAgentSection;
}) {
	const docker = sandbox.provider === "docker";
	return (
		<>
			<SettingsRow
				label="実行場所"
				hint={docker ? undefined : "隔離されません。コマンドがこの PC でそのまま動きます"}
				control={
					<Segmented
						label="実行場所"
						options={[
							{ value: "docker", label: "Docker" },
							{ value: "local", label: "この PC" },
						]}
						value={sandbox.provider}
						onChange={(provider) => set("sandbox", { provider })}
					/>
				}
			/>
			{docker && dockerRow}
			{docker && (
				<SettingsDisclosure label="コンテナの詳細">
					<SettingsInset>
						<SettingsRow
							label="イメージ"
							htmlFor="image"
							control={
								<div className="flex w-64 max-w-full">
									<SaveInput
										id="image"
										className="font-mono"
										value={sandbox.image}
										onSave={(image) => set("sandbox", { image })}
									/>
								</div>
							}
						/>
						<NumberField
							id="mem"
							label="メモリ上限（MB）"
							value={sandbox.memory_mb}
							min={128}
							step={256}
							onChange={(memory_mb) => set("sandbox", { memory_mb })}
						/>
						<NumberField
							id="cpus"
							label="CPU"
							value={sandbox.cpus}
							min={0.25}
							step={0.5}
							onChange={(cpus) => set("sandbox", { cpus })}
						/>
						<NumberField
							id="timeout"
							label="制限時間（秒）"
							value={sandbox.timeout_sec}
							min={5}
							step={30}
							onChange={(timeout_sec) => set("sandbox", { timeout_sec })}
						/>
						<SwitchRow
							id="network"
							label="ネットワークを使う"
							checked={sandbox.network}
							onChange={(network) => set("sandbox", { network })}
						/>
					</SettingsInset>
				</SettingsDisclosure>
			)}
		</>
	);
}
