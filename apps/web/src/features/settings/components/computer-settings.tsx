import { Dot } from "@/components/status";
import { useDockerStatus } from "@/features/agent/queries";
import { AgentSettingsPage } from "./agent-settings";
import { SandboxToolSettings } from "./sandbox-tool-settings";
import { NumberField, SwitchRow } from "./settings-fields";
import { SettingsGroup, SettingsRow } from "./settings-layout";

/** What the characters may do on a computer: a desktop of their own, and files and
 *  commands in a workspace. */
export default function ComputerSettings() {
	const docker = useDockerStatus();
	const dockerRow = (
		<SettingsRow
			label="Docker"
			control={
				docker.isPending ? (
					<Dot tone="muted">確認中</Dot>
				) : docker.data?.ok ? (
					<Dot tone="success">{docker.data.version}</Dot>
				) : (
					<Dot tone="destructive">接続できません</Dot>
				)
			}
		/>
	);
	return (
		<AgentSettingsPage>
			{({ form: { desktop, sandbox }, set }) => (
				<>
					<SettingsGroup title="デスクトップ">
						<SwitchRow
							id="desktop-enabled"
							label="デスクトップを使う"
							description="キャラクターごとの Linux デスクトップ。画像を読めるモデルで使えます"
							checked={desktop.enabled}
							onChange={(enabled) => set("desktop", { enabled })}
						/>
						{desktop.enabled && (
							<>
								{dockerRow}
								<NumberField
									id="desktop-mem"
									label="メモリ上限（MB）"
									value={desktop.memory_mb}
									min={512}
									step={512}
									onChange={(memory_mb) => set("desktop", { memory_mb })}
								/>
								<NumberField
									id="desktop-cpus"
									label="CPU"
									value={desktop.cpus}
									min={0.5}
									step={0.5}
									onChange={(cpus) => set("desktop", { cpus })}
								/>
							</>
						)}
					</SettingsGroup>

					<SettingsGroup title="ファイルとコマンド">
						<SwitchRow
							id="sandbox-enabled"
							label="ファイルとコマンドを使う"
							checked={sandbox.enabled}
							onChange={(enabled) => set("sandbox", { enabled })}
						/>
						{sandbox.enabled && (
							<SandboxToolSettings sandbox={sandbox} dockerRow={dockerRow} set={set} />
						)}
					</SettingsGroup>
				</>
			)}
		</AgentSettingsPage>
	);
}
