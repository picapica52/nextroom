import { SettingsSection } from "@/components/settings-section";
import { useDockerStatus } from "@/features/agent/queries";
import { AgentSettingsPage } from "./agent-settings";
import { SandboxToolSettings } from "./sandbox-tool-settings";
import { SwitchRow } from "./settings-fields";

/** What the characters may do on this PC: a browser, and files and commands in a workspace. */
export default function ComputerSettings() {
	const docker = useDockerStatus();
	return (
		<AgentSettingsPage>
			{({ form: { browser, sandbox }, set }) => (
				<>
					<SettingsSection
						title="ブラウザ"
						description="キャラクターが Web ページを開いて調べたり、操作したりします。ページの読み取りにもメインモデルを使います。"
					>
						<SwitchRow
							id="browser-enabled"
							label="ブラウザを使う"
							checked={browser.enabled}
							onChange={(enabled) => set("browser", { enabled })}
						/>
						{browser.enabled && (
							<SwitchRow
								id="headless"
								label="Chrome のウィンドウを表示する"
								description="オフでも、操作中の画面はこのアプリのブラウザ画面に映ります。"
								checked={!browser.headless}
								onChange={(show) => set("browser", { headless: !show })}
							/>
						)}
					</SettingsSection>

					<SettingsSection
						title="ファイルとコマンド"
						description="キャラクターごとのワークスペースで、ファイルを作ったりコマンドを実行したりします。"
					>
						<SwitchRow
							id="sandbox-enabled"
							label="ファイルとコマンドを使う"
							checked={sandbox.enabled}
							onChange={(enabled) => set("sandbox", { enabled })}
						/>
						{sandbox.enabled && (
							<SandboxToolSettings sandbox={sandbox} docker={docker.data} set={set} />
						)}
					</SettingsSection>
				</>
			)}
		</AgentSettingsPage>
	);
}
