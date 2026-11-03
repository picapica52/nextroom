import { Dot } from "@/components/status";
import { useDockerStatus } from "@/features/agent/queries";
import { AgentSettingsPage } from "./agent-settings";
import { NumberField, SwitchRow } from "./settings-fields";
import { SettingsGroup, SettingsRow } from "./settings-layout";

/** What the characters may do on a computer of their own (a Docker container each): use its
 *  desktop, and its files and commands. Nothing of this PC is reachable from it. */
export default function ComputerSettings() {
	const docker = useDockerStatus();
	return (
		<AgentSettingsPage>
			{({ form: { container, desktop, sandbox }, set }) => (
				<>
					<SettingsGroup title="道具">
						<SwitchRow
							id="desktop-enabled"
							label="デスクトップを使う"
							description="画面を見ながら操作します。画像を読めるモデルで使えます"
							checked={desktop.enabled}
							onChange={(enabled) => set("desktop", { enabled })}
						/>
						<SwitchRow
							id="sandbox-enabled"
							label="ファイルとコマンドを使う"
							checked={sandbox.enabled}
							onChange={(enabled) => set("sandbox", { enabled })}
						/>
						{sandbox.enabled && (
							<NumberField
								id="timeout"
								label="コマンドの制限時間（秒）"
								value={sandbox.timeout_sec}
								min={5}
								step={30}
								onChange={(timeout_sec) => set("sandbox", { timeout_sec })}
							/>
						)}
					</SettingsGroup>

					{(desktop.enabled || sandbox.enabled) && (
						<SettingsGroup title="コンピューター">
							<SettingsRow
								label="Docker"
								hint="キャラクターごとの Linux のコンテナで作業します。この PC のファイルには触れません"
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
							<NumberField
								id="container-mem"
								label="メモリ上限（MB）"
								value={container.memory_mb}
								min={512}
								step={512}
								onChange={(memory_mb) => set("container", { memory_mb })}
							/>
							<NumberField
								id="container-cpus"
								label="CPU"
								value={container.cpus}
								min={0.5}
								step={0.5}
								onChange={(cpus) => set("container", { cpus })}
							/>
						</SettingsGroup>
					)}
				</>
			)}
		</AgentSettingsPage>
	);
}
