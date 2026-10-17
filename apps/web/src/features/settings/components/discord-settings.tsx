import type { DiscordSettingsPatch, DiscordSettingsView, DiscordStatus } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@nextroom/ui/components/field";
import { ExternalLink, Lock } from "lucide-react";
import { useState } from "react";
import { AnchorButton } from "@/components/buttons";
import { SaveInput } from "@/components/save-field";
import { SettingsBody, SettingsErrorFooter, SettingsSection } from "@/components/settings-section";
import { SimpleSelect } from "@/components/simple-select";
import { Dot, ErrorNote } from "@/components/status";
import { useCharacters } from "@/features/characters/queries";
import { useDiscordSettings, useSaveDiscordSettings } from "@/features/discord/queries";
import { useChatSettings } from "@/hooks/queries";
import { NumberField, SwitchRow } from "./settings-fields";

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
				<SettingsSection
					title="bot"
					description="Discord Developer Portal で作った bot でログインします。公開サーバーは要りません。"
					action={<StatusDot status={form.status} enabled={form.enabled} />}
				>
					<SwitchRow
						id="discord-enabled"
						label="bot を動かす"
						description="オンの間、このアプリから Discord にログインします"
						checked={form.enabled}
						onChange={(enabled) => set({ enabled })}
					/>
					<TokenField isSet={form.has_bot_token} set={set} />
					<StatusDetail status={form.status} />
					<FieldDescription className="text-xs">
						<a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">
							Developer Portal
						</a>
						で「New Application」を作り、「Bot」で「Reset
						Token」を押して出たトークンを貼り付けます。特権 Intent
						は要りません。ログインできたら「サーバーに追加」から招待し、ボイスチャンネルに入った状態で
						<code>/join</code> と打つと参加します。<code>/leave</code>{" "}
						で退出し、誰もいなくなっても退出します。
					</FieldDescription>
				</SettingsSection>

				<TalkSection form={form} set={set} />
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
			<Field>
				<FieldLabel>トークン</FieldLabel>
				<div className="flex min-h-10 items-center gap-2.5 rounded-lg border-2 bg-muted py-1 pr-1.5 pl-3">
					<Lock className="size-4 shrink-0" aria-hidden="true" />
					<span className="font-mono tracking-widest text-muted-foreground">••••••••••••</span>
					<span className="text-xs font-bold text-success">保存済み</span>
					<span className="ml-auto flex gap-1">
						<Button variant="outline" size="xs" onClick={() => setReplacing(true)}>
							変更
						</Button>
						<Button
							variant="ghost"
							size="xs"
							className="text-muted-foreground"
							onClick={() => set({ bot_token: "" })}
						>
							削除
						</Button>
					</span>
				</div>
			</Field>
		);
	return (
		<Field>
			<FieldLabel htmlFor="discord-token">{isSet ? "新しいトークン" : "トークン"}</FieldLabel>
			<div className="flex gap-2">
				<SaveInput
					id="discord-token"
					type="password"
					autoComplete="off"
					className="font-mono"
					autoFocus={replacing}
					value=""
					placeholder={
						isSet ? "保存済みのトークンと置き換えます" : "（環境変数 DISCORD_BOT_TOKEN でも可）"
					}
					onSave={async (token) => {
						if (!token.trim()) return false;
						const ok = await set({ bot_token: token.trim() });
						if (ok) setReplacing(false);
						return ok;
					}}
				/>
				{replacing && (
					<Button variant="ghost" onClick={() => setReplacing(false)}>
						やめる
					</Button>
				)}
			</div>
		</Field>
	);
}

function TalkSection({ form, set }: { form: DiscordSettingsView; set: Set }) {
	const characters = useCharacters();
	const chat = useChatSettings();
	const silent = chat.data && !chat.data.tts_enabled;
	return (
		<SettingsSection
			title="話しかた"
			description="ボイスチャンネルでの会話は、アプリのそのキャラクターとの会話の続きになります。聞き取りと読み上げは「モデル」の設定のものを使います。"
		>
			<Field>
				<FieldLabel htmlFor="discord-character">話すキャラクター</FieldLabel>
				<SimpleSelect<string>
					id="discord-character"
					value={form.character_id}
					onChange={(character_id) => set({ character_id })}
					placeholder="選んでください"
					options={(characters.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
				/>
			</Field>
			{silent && (
				<ErrorNote error="「返答のしかた」で読み上げがオフになっているため、ボイスチャンネルでは喋りません" />
			)}
			<SwitchRow
				id="discord-greet"
				label="参加したときに話しかける"
				description="話すきっかけがあれば、キャラクターから先に話します"
				checked={form.greet}
				onChange={(greet) => set({ greet })}
			/>
			<NumberField
				id="discord-silence"
				label="話の区切り（ミリ秒）"
				description="この長さ黙ると、そこまでを一言として聞き取ります（300〜3000）"
				value={form.silence_ms}
				step={100}
				min={300}
				max={3000}
				onChange={(silence_ms) => set({ silence_ms })}
			/>
		</SettingsSection>
	);
}
