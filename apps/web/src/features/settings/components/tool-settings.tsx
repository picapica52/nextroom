import { Link } from "react-router-dom";
import { Dot } from "@/components/status";
import { useDockerStatus } from "@/features/agent/queries";
import { useChatSettings } from "@/hooks/queries";
import { settingsPath } from "../pages";
import { AgentSettingsPage } from "./agent-settings";
import { ComposioToolSettings } from "./composio-tool-settings";
import { MissingKey } from "./connection-fields";
import { NumberField, SwitchRow } from "./settings-fields";
import { SettingsGroup } from "./settings-layout";

/** What the characters may use in a conversation: the web, apps through Composio, and a computer of
 *  their own (a Docker container each, from which nothing of this PC is reachable). */
export default function ToolSettings() {
	const docker = useDockerStatus();
	const imageModel = useChatSettings().data?.image_model;
	return (
		<AgentSettingsPage>
			{({ form, set }) => {
				const { computer } = form;
				return (
					<>
						<SettingsGroup title="Web">
							<SwitchRow
								id="web-search-enabled"
								label="Web 検索"
								description="わからないことや最新のことを調べます"
								checked={form.web_search.enabled}
								onChange={(enabled) => set("web_search", { enabled })}
							>
								{form.web_search.enabled && <MissingKey name="exa_key" service="Exa" />}
							</SwitchRow>
							<SwitchRow
								id="topic-search-enabled"
								label="話題さがし"
								description="「何か話して」と言われたら話題を探してきます"
								checked={form.topic_search.enabled}
								onChange={(enabled) => set("topic_search", { enabled })}
							>
								{form.topic_search.enabled && <MissingKey name="exa_key" service="Exa" />}
							</SwitchRow>
						</SettingsGroup>

						<SettingsGroup title="アプリ">
							<SwitchRow
								id="composio-enabled"
								label="Gmail・Google カレンダーなどを使う"
								description="Composio を通して、選んだアプリを操作します"
								checked={form.composio.enabled}
								onChange={(enabled) => set("composio", { enabled })}
							>
								{form.composio.enabled && <MissingKey name="composio_key" service="Composio" />}
							</SwitchRow>
							{form.composio.enabled && <ComposioToolSettings composio={form.composio} set={set} />}
						</SettingsGroup>

						<SettingsGroup
							id="computer"
							title="コンピューター"
							description="キャラクターごとの Linux のコンテナで作業します。この PC のファイルには触れません"
							action={
								computer.enabled &&
								(docker.isPending ? (
									<Dot tone="muted">Docker を確認中</Dot>
								) : docker.data?.ok ? (
									<Dot tone="success">Docker {docker.data.version}</Dot>
								) : (
									<Dot tone="destructive">Docker に接続できません</Dot>
								))
							}
						>
							<SwitchRow
								id="computer-enabled"
								label="コンピューターを使う"
								description="コマンドでファイルを作ったりプログラムを動かしたりします。画像を読めるモデルなら、画面を見ながらの操作もします"
								checked={computer.enabled}
								onChange={(enabled) => set("computer", { enabled })}
							/>
							{computer.enabled && (
								<>
									<NumberField
										id="timeout"
										label="コマンドの制限時間（秒）"
										value={computer.timeout_sec}
										min={5}
										step={30}
										onChange={(timeout_sec) => set("computer", { timeout_sec })}
									/>
									<NumberField
										id="container-mem"
										label="メモリ上限（MB）"
										description="キャラクターごとの上限"
										value={computer.memory_mb}
										min={512}
										step={512}
										onChange={(memory_mb) => set("computer", { memory_mb })}
									/>
									<NumberField
										id="container-cpus"
										label="CPU"
										value={computer.cpus}
										min={0.5}
										step={0.5}
										onChange={(cpus) => set("computer", { cpus })}
									/>
								</>
							)}
						</SettingsGroup>

						<SettingsGroup title="会話">
							<SwitchRow
								id="ask-user-enabled"
								label="選択肢を出す"
								description="聞きたいことがあるとき、押して選べる選択肢を出します"
								checked={form.ask_user.enabled}
								onChange={(enabled) => set("ask_user", { enabled })}
							/>
							<SwitchRow
								id="send-photo-enabled"
								label="写真を送る"
								description="自撮りや食べているもの、景色などの写真を画像生成で作って送ります"
								checked={form.send_photo.enabled}
								onChange={(enabled) => set("send_photo", { enabled })}
							>
								{form.send_photo.enabled && imageModel === null && (
									<p className="m-0 text-xs text-warning">
										<Link to={settingsPath("models")}>設定 → モデル</Link>{" "}
										で「画像の生成」のモデルを選んでください。
									</p>
								)}
							</SwitchRow>
							<SwitchRow
								id="routines-enabled"
								label="ルーティンを作れる"
								description="頼まれたら、決まった時間に自分から動く予定（起こす・知らせるなど）を作ります"
								checked={form.routines.enabled}
								onChange={(enabled) => set("routines", { enabled })}
							/>
						</SettingsGroup>
					</>
				);
			}}
		</AgentSettingsPage>
	);
}
