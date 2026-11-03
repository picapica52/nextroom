import type { DiscordSettingsPatch, DiscordSettingsView, DiscordStatus } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { AnchorButton } from "@/components/buttons";
import { SaveInput } from "@/components/save-field";
import { SettingsErrorFooter } from "@/components/settings-section";
import { SimpleSelect } from "@/components/simple-select";
import { Dot, ErrorNote } from "@/components/status";
import { useCharacters } from "@/features/characters/queries";
import { useDiscordSettings, useSaveDiscordSettings } from "@/features/discord/queries";
import { useChatSettings } from "@/hooks/queries";
import { NumberField, SwitchRow } from "./settings-fields";
import {
	SettingsPageBody as SettingsBody,
	SettingsDisclosure,
	SettingsGroup,
	SettingsRow,
} from "./settings-layout";

type Set = (patch: DiscordSettingsPatch) => Promise<boolean>;

/** The Discord bot: how it logs in, which character it talks as, and how it listens. A change is
 *  saved as soon as it is made. */
export default function DiscordSettings() {
	const saved = useDiscordSettings();
	const save = useSaveDiscordSettings();
	if (!saved.data)
		return (
			<SettingsBody>
				<ErrorNote error={saved.error} />
			</SettingsBody>
		);
	const form = saved.data;
	const set: Set = (patch) =>
		save.mutateAsync(patch).then(
			() => true,
			() => false,
		);

	return (
		<>
			<SettingsBody>
				<SettingsGroup
					title="bot"
					action={<StatusDot status={form.status} enabled={form.enabled} />}
				>
					<SwitchRow
						id="discord-enabled"
						label="bot を動かす"
						checked={form.enabled}
						onChange={(enabled) => set({ enabled })}
					>
						<StatusDetail status={form.status} />
					</SwitchRow>
					<TokenField isSet={form.has_bot_token} set={set} />
					<SettingsDisclosure label="設定のしかた">
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
			</SettingsBody>
			<SettingsErrorFooter error={save.error} />
		</>
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

function TokenField({ isSet, set }: { isSet: boolean; set: Set }) {
	const [replacing, setReplacing] = useState(false);
	if (isSet && !replacing)
		return (
			<SettingsRow
				label="トークン"
				control={
					<>
						<Dot tone="success">保存済み</Dot>
						<Button variant="outline" size="sm" onClick={() => setReplacing(true)}>
							変更
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="text-muted-foreground"
							onClick={() => set({ bot_token: "" })}
						>
							削除
						</Button>
					</>
				}
			/>
		);
	return (
		<SettingsRow
			label="トークン"
			htmlFor="discord-token"
			control={
				<div className="flex w-72 max-w-full items-center gap-2">
					<SaveInput
						id="discord-token"
						type="password"
						autoComplete="off"
						className="font-mono"
						autoFocus={replacing}
						value=""
						placeholder="貼り付け"
						onSave={async (token) => {
							if (!token.trim()) return false;
							const ok = await set({ bot_token: token.trim() });
							if (ok) setReplacing(false);
							return ok;
						}}
					/>
					{replacing && (
						<Button variant="ghost" size="sm" onClick={() => setReplacing(false)}>
							やめる
						</Button>
					)}
				</div>
			}
		/>
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
						「音声」で読み上げがオフのため、ボイスチャンネルでは喋りません。
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
