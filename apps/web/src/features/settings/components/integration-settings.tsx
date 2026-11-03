import { Link } from "react-router-dom";
import { SettingsSection } from "@/components/settings-section";
import { AgentSettingsPage } from "./agent-settings";
import { ComposioToolSettings } from "./composio-tool-settings";
import { KeyField, KeyStatus } from "./connection-fields";
import { SwitchRow } from "./settings-fields";

/** The services and abilities the characters use in a conversation, and their keys. */
export default function IntegrationSettings() {
	return (
		<AgentSettingsPage>
			{({ form, set }) => (
				<>
					<SettingsSection
						title="Web 検索と話題さがし"
						description={
							<>
								どちらも{" "}
								<a href="https://exa.ai" target="_blank" rel="noreferrer">
									Exa
								</a>{" "}
								で検索します。
							</>
						}
					>
						<KeyField name="exa_key" />
						<SwitchRow
							id="web-search-enabled"
							label="Web 検索"
							description="Exa で検索して、上位のページの要点を読みます。"
							checked={form.web_search.enabled}
							onChange={(enabled) => set("web_search", { enabled })}
						/>
						<SwitchRow
							id="topic-search-enabled"
							label="話題さがし"
							description="「何か話して」と言われたら、好きなことと新しいことの話題を探します。"
							checked={form.topic_search.enabled}
							onChange={(enabled) => set("topic_search", { enabled })}
						/>
					</SettingsSection>

					<SettingsSection
						title="アプリ連携"
						description="Gmail・Google カレンダーなどのアプリを Composio 経由で使います。"
					>
						<KeyField name="composio_key" />
						<SwitchRow
							id="composio-enabled"
							label="アプリ連携を使う"
							checked={form.composio.enabled}
							onChange={(enabled) => set("composio", { enabled })}
						/>
						{form.composio.enabled && <ComposioToolSettings composio={form.composio} set={set} />}
					</SettingsSection>

					<SettingsSection title="画像の送信">
						<SwitchRow
							id="image-gen-enabled"
							label="写真を送る"
							description={
								<>
									キャラクターが自分の世界で撮った写真（自撮り・食事・景色など）を送ってきます。写真は
									<Link to="/settings/models">設定 → モデル</Link>
									の「画像の生成」のモデルで作り、キャラクターのアイコンや会話に添付した画像を参照します。
								</>
							}
							checked={form.image_gen.enabled}
							onChange={(enabled) => set("image_gen", { enabled })}
						/>
						{form.image_gen.enabled && (
							<>
								<KeyStatus
									name="openrouter_key"
									service="OpenRouter"
									where="設定 → モデル の「プロバイダー」で API キーを入力してください"
								/>
								{!form.image_gen.model && (
									<p className="m-0 text-xs text-warning">
										画像の生成のモデルが未設定です（設定 → モデル で選びます）。
									</p>
								)}
							</>
						)}
					</SettingsSection>

					<SettingsSection title="選択肢で聞く">
						<SwitchRow
							id="ask-user-enabled"
							label="選択肢を出す"
							description="作業の進め方など、決めてほしいことがあるときに返答の最後に選択肢を出します（選ばずに話しかけても大丈夫です）。"
							checked={form.ask_user.enabled}
							onChange={(enabled) => set("ask_user", { enabled })}
						/>
					</SettingsSection>

					<SettingsSection title="ルーティン">
						<SwitchRow
							id="routines-enabled"
							label="ルーティンを作れる"
							description="キャラクターが会話の中で、決まった時刻に自分で動くルーティンを作ったり、一覧を見たり、取り消したりできます。"
							checked={form.routines.enabled}
							onChange={(enabled) => set("routines", { enabled })}
						/>
					</SettingsSection>
				</>
			)}
		</AgentSettingsPage>
	);
}
