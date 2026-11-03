import type { DiscordSettingsPatch, DiscordSettingsView, DiscordStatus } from "@nextroom/contracts";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { AnchorButton } from "@/components/buttons";
import { SimpleSelect } from "@/components/simple-select";
import { Dot, ErrorNote } from "@/components/status";
import { useCharacters } from "@/features/characters/queries";
import { useDiscordSettings, useSaveDiscordSettings } from "@/features/discord/queries";
import { useChatSettings } from "@/hooks/queries";
import { settingsPath } from "../pages";
import { NumberField, SecretField, SwitchRow } from "./settings-fields";
import { SettingsDisclosure, SettingsGroup, SettingsPage, SettingsRow } from "./settings-layout";

type Set = (patch: DiscordSettingsPatch) => Promise<boolean>;

/** The Discord bot: how it logs in, which character it talks as, and how it listens. A change is
 *  saved as soon as it is made. */
export default function DiscordSettings() {
	const discord = useDiscordSettings();
	const save = useSaveDiscordSettings();
	const form = discord.data;
	const set: Set = (patch) =>
		save.mutateAsync(patch).then(
			() => true,
			() => false,
		);
	return (
		<SettingsPage loadError={!form && discord.error} saveError={save.error}>
			{form && (
				<>
					<SettingsGroup
						title="接続"
						action={<StatusDot status={form.status} enabled={form.enabled} />}
					>
						<SwitchRow
							id="discord-enabled"
							label="Discord に接続する"
							checked={form.enabled}
							onChange={(enabled) => set({ enabled })}
						>
							<StatusDetail status={form.status} />
						</SwitchRow>
						<SecretField
							id="discord-token"
							label="トークン"
							isSet={form.has_bot_token}
							onSave={(bot_token) => set({ bot_token })}
							onDelete={() => set({ bot_token: "" })}
						/>
						<SettingsDisclosure label="設定のしかた" defaultOpen={!form.has_bot_token}>
							<p className="m-0 text-xs leading-relaxed text-muted-foreground">
								<a
									href="https://discord.com/developers/applications"
									target="_blank"
									rel="noreferrer"
								>
									Developer Portal
								</a>
								で「New Application」を作り、「Bot」で「Reset
								Token」を押して出たトークンを貼り付けます。特権 Intent
								は要りません。ログインできたら「サーバーに追加」から招待し、ボイスチャンネルに入った状態で
								<code>/join</code> と打つと参加します。<code>/leave</code> で退出します。
							</p>
						</SettingsDisclosure>
					</SettingsGroup>

					<TalkGroup form={form} set={set} />
				</>
			)}
		</SettingsPage>
	);
}

function StatusDot({ status, enabled }: { status: DiscordStatus; enabled: boolean }) {
	if (!enabled) return <Dot tone="muted">オフ</Dot>;
	if (status.state === "ready")
		return (
			<Dot tone={status.channel ? "info" : "success"}>
				{status.channel ? "通話中" : "ログイン中"}
			</Dot>
		);
	if (status.state === "connecting") return <Dot tone="warning">接続中</Dot>;
	if (status.state === "error") return <Dot tone="destructive">エラー</Dot>;
	return <Dot tone="muted">トークン未設定</Dot>;
}

function StatusDetail({ status }: { status: DiscordStatus }) {
	if (status.error) return <ErrorNote error={`ログインできませんでした: ${status.error}`} />;
	if (status.state !== "ready") return null;
	return (
		<div className="flex flex-wrap items-center gap-2 text-sm">
			<span className="font-mono">{status.bot_name}</span>
			{status.channel && (
				<span className="text-muted-foreground">
					{status.channel.guild} の {status.channel.name} にいます
				</span>
			)}
			{status.invite_url && (
				<AnchorButton
					size="xs"
					className="ml-auto"
					href={status.invite_url}
					target="_blank"
					rel="noreferrer"
				>
					<ExternalLink />
					サーバーに追加
				</AnchorButton>
			)}
		</div>
	);
}

function TalkGroup({ form, set }: { form: DiscordSettingsView; set: Set }) {
	const characters = useCharacters();
	const chat = useChatSettings();
	const silent = chat.data && !chat.data.tts_enabled;
	return (
		<SettingsGroup title="話しかた">
			<SettingsRow
				label="話すキャラクター"
				htmlFor="discord-character"
				control={
					<div className="w-56 max-w-full">
						<SimpleSelect<string>
							id="discord-character"
							value={form.character_id}
							onChange={(character_id) => set({ character_id })}
							placeholder="選んでください"
							options={(characters.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
						/>
					</div>
				}
			>
				{silent && (
					<p className="m-0 text-xs text-warning">
						読み上げがオフのため、ボイスチャンネルでは喋りません（
						<Link to={settingsPath("voice", "tts-enabled")} className="text-warning">
							音声
						</Link>
						でオンにできます）。
					</p>
				)}
			</SettingsRow>
			<SwitchRow
				id="discord-greet"
				label="参加したときに話しかける"
				checked={form.greet}
				onChange={(greet) => set({ greet })}
			/>
			<NumberField
				id="discord-silence"
				label="話の区切り（ミリ秒）"
				description="この長さ黙ると一言として聞き取ります"
				value={form.silence_ms}
				step={100}
				min={300}
				max={3000}
				onChange={(silence_ms) => set({ silence_ms })}
			/>
		</SettingsGroup>
	);
}
