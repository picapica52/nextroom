import { AgentSettingsPage } from "./agent-settings";
import { ComposioToolSettings } from "./composio-tool-settings";
import { KeyField, MissingKey } from "./connection-fields";
import { SwitchRow } from "./settings-fields";
import { SettingsGroup } from "./settings-layout";

/** The services and abilities the characters use in a conversation, and their keys. */
export default function IntegrationSettings() {
	return (
		<AgentSettingsPage>
			{({ form, set }) => (
				<>
					<SettingsGroup title="Web 検索（Exa）">
						<SwitchRow
							id="web-search-enabled"
							label="Web 検索"
							checked={form.web_search.enabled}
							onChange={(enabled) => set("web_search", { enabled })}
						/>
						<SwitchRow
							id="topic-search-enabled"
							label="話題さがし"
							description="「何か話して」と言われたら話題を探してくる"
							checked={form.topic_search.enabled}
							onChange={(enabled) => set("topic_search", { enabled })}
						/>
						<KeyField name="exa_key" />
					</SettingsGroup>

					<SettingsGroup title="アプリ連携（Composio）">
						<SwitchRow
							id="composio-enabled"
							label="Gmail・Google カレンダーなどを使う"
							checked={form.composio.enabled}
							onChange={(enabled) => set("composio", { enabled })}
						/>
						{form.composio.enabled && (
							<>
								<KeyField name="composio_key" />
								<ComposioToolSettings composio={form.composio} set={set} />
							</>
						)}
					</SettingsGroup>

					<SettingsGroup title="そのほか">
						<SwitchRow
							id="image-gen-enabled"
							label="写真を送る"
							checked={form.image_gen.enabled}
							onChange={(enabled) => set("image_gen", { enabled })}
						>
							{form.image_gen.enabled && (
								<>
									<MissingKey
										name="openrouter_key"
										service="OpenRouter"
										where="設定 → モデル の「プロバイダー」で入力します。"
									/>
									{!form.image_gen.model && (
										<p className="m-0 text-xs text-warning">
											設定 → モデル で「画像の生成」のモデルを選んでください。
										</p>
									)}
								</>
							)}
						</SwitchRow>
						<SwitchRow
							id="ask-user-enabled"
							label="選択肢を出す"
							checked={form.ask_user.enabled}
							onChange={(enabled) => set("ask_user", { enabled })}
						/>
						<SwitchRow
							id="routines-enabled"
							label="ルーティンを作れる"
							checked={form.routines.enabled}
							onChange={(enabled) => set("routines", { enabled })}
						/>
					</SettingsGroup>
				</>
			)}
		</AgentSettingsPage>
	);
}
