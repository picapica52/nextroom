import type { SlackSettingsPatch, SlackSettingsView, SlackStatus } from "@nextroom/contracts";
import { CopyButton } from "@/components/copy-button";
import { SimpleSelect } from "@/components/simple-select";
import { Dot, ErrorNote } from "@/components/status";
import { useCharacters } from "@/features/characters/queries";
import { useSaveSlackSettings, useSlackSettings } from "@/features/slack/queries";
import { SecretField, SwitchRow } from "./settings-fields";
import { SettingsDisclosure, SettingsGroup, SettingsPage, SettingsRow } from "./settings-layout";

type Set = (patch: SlackSettingsPatch) => Promise<boolean>;

/** What the Slack app needs: Socket Mode, direct messages and mentions. */
const MANIFEST = JSON.stringify(
	{
		display_information: { name: "nextroom" },
		features: {
			app_home: { messages_tab_enabled: true, messages_tab_read_only_enabled: false },
			bot_user: { display_name: "nextroom", always_online: true },
		},
		oauth_config: {
			scopes: {
				bot: ["app_mentions:read", "chat:write", "im:history", "reactions:write", "users:read"],
			},
		},
		settings: {
			event_subscriptions: { bot_events: ["app_mention", "message.im"] },
			socket_mode_enabled: true,
		},
	},
	null,
	2,
);

/** The Slack bot: how it connects and which character it talks as. A change is saved as soon as
 *  it is made. */
export default function SlackSettings() {
	const slack = useSlackSettings();
	const save = useSaveSlackSettings();
	const form = slack.data;
	const set: Set = (patch) =>
		save.mutateAsync(patch).then(
			() => true,
			() => false,
		);
	return (
		<SettingsPage loadError={!form && slack.error} saveError={save.error}>
			{form && <SlackGroup form={form} set={set} />}
		</SettingsPage>
	);
}

function SlackGroup({ form, set }: { form: SlackSettingsView; set: Set }) {
	const characters = useCharacters();
	return (
		<SettingsGroup title="接続" action={<StatusDot form={form} />}>
			<SwitchRow
				id="slack-enabled"
				label="Slack に接続する"
				checked={form.enabled}
				onChange={(enabled) => set({ enabled })}
			>
				<StatusDetail status={form.status} />
			</SwitchRow>
			<SecretField
				id="slack-bot-token"
				label="Bot Token"
				placeholder="xoxb-…"
				isSet={form.has_bot_token}
				onSave={(bot_token) => set({ bot_token })}
				onDelete={() => set({ bot_token: "" })}
			/>
			<SecretField
				id="slack-app-token"
				label="App-Level Token"
				placeholder="xapp-…"
				isSet={form.has_app_token}
				onSave={(app_token) => set({ app_token })}
				onDelete={() => set({ app_token: "" })}
			/>
			<SettingsRow
				label="話すキャラクター"
				htmlFor="slack-character"
				control={
					<div className="w-56 max-w-full">
						<SimpleSelect<string>
							id="slack-character"
							value={form.character_id}
							onChange={(character_id) => set({ character_id })}
							placeholder="選んでください"
							options={(characters.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
						/>
					</div>
				}
			/>
			<SettingsDisclosure
				label="設定のしかた"
				defaultOpen={!form.has_bot_token || !form.has_app_token}
			>
				<div className="flex flex-col gap-2 text-xs leading-relaxed text-muted-foreground">
					<p className="m-0">
						<a href="https://api.slack.com/apps?new_app=1" target="_blank" rel="noreferrer">
							Slack API
						</a>
						で「From a manifest」を選び、下のマニフェストを貼り付けてアプリを作ります。「Install
						App」でワークスペースにインストールして出る「Bot User OAuth Token」を Bot Token
						に、「Basic Information」の「App-Level Tokens」で <code>connections:write</code>{" "}
						を付けて作ったトークンを App-Level Token に貼り付けます。
					</p>
					<p className="m-0">
						bot にダイレクトメッセージを送るか、チャンネルで <code>@</code>{" "}
						を付けて呼ぶと返事をします（チャンネルではスレッドに返します）。
					</p>
					<div>
						<CopyButton text={MANIFEST} labelled />
					</div>
				</div>
			</SettingsDisclosure>
		</SettingsGroup>
	);
}

function StatusDot({ form }: { form: SlackSettingsView }) {
	if (!form.enabled) return <Dot tone="muted">オフ</Dot>;
	const { state } = form.status;
	if (state === "ready") return <Dot tone="success">接続中</Dot>;
	if (state === "connecting") return <Dot tone="warning">接続しています</Dot>;
	if (state === "error") return <Dot tone="destructive">エラー</Dot>;
	return <Dot tone="muted">トークン未設定</Dot>;
}

function StatusDetail({ status }: { status: SlackStatus }) {
	if (status.error) return <ErrorNote error={`接続できませんでした: ${status.error}`} />;
	if (status.state !== "ready") return null;
	return (
		<div className="flex flex-wrap items-center gap-2 text-sm">
			<span className="font-mono">{status.bot_name}</span>
			{status.team && <span className="text-muted-foreground">{status.team} に参加しています</span>}
		</div>
	);
}
