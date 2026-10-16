import type { AgentSettingsView } from "@nextroom/contracts";
import type { SetAgentSection } from "../agent-options";
import { SwitchRow } from "./settings-fields";

export const browserToolSummary = (browser: AgentSettingsView["browser"]) =>
	browser.headless ? "Chrome を表示せずに操作" : "Chrome を表示して操作";

export function BrowserToolSettings({
	browser,
	set,
}: {
	browser: AgentSettingsView["browser"];
	set: SetAgentSection;
}) {
	return (
		<SwitchRow
			id="headless"
			label="Chrome のウィンドウを表示する"
			description="オフでも、操作中の画面はこのアプリのブラウザ画面に映ります。ページの読み取りにも会話の LLM を使います。"
			checked={!browser.headless}
			onChange={(show) => set("browser", { headless: !show })}
		/>
	);
}
