import type {
	ConnectionKey,
	ConnectionSource,
	ConnectionUrl,
	LlmProvider,
} from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { SaveInput } from "@/components/save-field";
import { Dot, ErrorNote } from "@/components/status";
import { useConnections, useProviders, useSaveConnections } from "@/hooks/queries";
import { client, read } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { settingsPath } from "../pages";
import { SettingsRow } from "./settings-layout";

/** Where a key or address comes from: entered here, the server's .env, the default, or nowhere. */
export function SourceBadge({
	source,
	optional,
}: {
	source: ConnectionSource | undefined;
	/** It works without one (a local LLM). */
	optional?: boolean;
}) {
	if (source === undefined) return null;
	if (source === "settings") return <Dot tone="success">設定済み</Dot>;
	if (source === "env") return <Dot tone="success">.env から</Dot>;
	if (source === "default") return <Dot tone="muted">既定</Dot>;
	return optional ? <Dot tone="muted">キーなし</Dot> : <Dot tone="warning">未設定</Dot>;
}

/** An API key as a row: typed in and saved, never shown again; clearing it lets the .env's apply. */
export function KeyField({
	name,
	label = "API キー",
	optional,
}: {
	name: ConnectionKey;
	label?: string;
	optional?: boolean;
}) {
	const connections = useConnections();
	const save = useSaveConnections();
	const key = connections.data?.keys[name];
	const id = `key-${name}`;
	const submit = (value: string) =>
		save.mutateAsync({ [name]: value }).then(
			() => true,
			() => false,
		);
	return (
		<SettingsRow
			label={
				<span className="flex items-center gap-2">
					{label}
					<SourceBadge source={key?.source} optional={optional} />
				</span>
			}
			htmlFor={id}
			control={
				<div className="flex w-72 max-w-full items-center gap-2">
					<SaveInput
						id={id}
						type="password"
						autoComplete="off"
						className="font-mono"
						value=""
						placeholder={key?.set ? "入力すると置き換え" : "貼り付け"}
						onSave={(text) => (text.trim() ? submit(text.trim()) : true)}
					/>
					{key?.source === "settings" && (
						<Button
							variant="ghost"
							size="sm"
							disabled={save.isPending}
							onClick={() => void submit("")}
						>
							消す
						</Button>
					)}
				</div>
			}
		>
			<ErrorNote error={connections.error ?? save.error} />
		</SettingsRow>
	);
}

/** A service's address as a row; saving it empty goes back to the .env's (or the default). */
export function UrlField({
	name,
	label,
	placeholder,
}: {
	name: ConnectionUrl;
	label: string;
	placeholder?: string;
}) {
	const connections = useConnections();
	const save = useSaveConnections();
	const url = connections.data?.urls[name];
	const id = `url-${name}`;
	return (
		<SettingsRow
			label={
				<span className="flex items-center gap-2">
					{label}
					<SourceBadge source={url?.source} />
				</span>
			}
			htmlFor={id}
			control={
				<div className="flex w-72 max-w-full items-center">
					<SaveInput
						id={id}
						type="url"
						className="font-mono"
						value={url?.value ?? ""}
						placeholder={placeholder}
						onSave={(text) =>
							save.mutateAsync({ [name]: text.trim() }).then(
								() => true,
								() => false,
							)
						}
					/>
				</div>
			}
		>
			<ErrorNote error={connections.error ?? save.error} />
		</SettingsRow>
	);
}

/** Whether a key is set, as a pill. */
export function KeyBadge({ name }: { name: ConnectionKey }) {
	const key = useConnections().data?.keys[name];
	if (!key) return null;
	return key.set ? <Dot tone="success">設定済み</Dot> : <Dot tone="muted">未設定</Dot>;
}

/** A note that a key something needs is not set, with a link to where it is entered; nothing
 *  once it is. */
export function MissingKey({ name, service }: { name: ConnectionKey; service: string }) {
	const key = useConnections().data?.keys[name];
	if (!key || key.set) return null;
	return (
		<p className="m-0 text-xs text-warning">
			{service} の API キーが未設定です。
			<Link to={settingsPath("connections", name)} className="text-warning">
				接続で入力する →
			</Link>
		</p>
	);
}

/** Whether some provider a model can be chosen from is ready (undefined while unknown). */
export function useHasLlmProvider(): boolean | undefined {
	return useProviders().data?.some((p) => p.configured);
}

/** Lists the account's voices to see that the key works. */
export function ElevenlabsCheck() {
	const check = useMutation({ mutationFn: () => read(client.elevenlabs.voices.$get()) });
	return (
		<CheckRow
			pending={check.isPending}
			onCheck={() => check.mutate()}
			done={check.data && `接続できました · 声 ${check.data.length} 件`}
			error={check.error}
		/>
	);
}

/** Lists the account's own voices to see that the key works. */
export function FishAudioCheck() {
	const check = useMutation({ mutationFn: () => read(client["fish-audio"].voices.$get()) });
	return (
		<CheckRow
			pending={check.isPending}
			onCheck={() => check.mutate()}
			done={check.data && `接続できました · 自分の声 ${check.data.length} 件`}
			error={check.error}
		/>
	);
}

/** Asks the speech.cpp server which models it holds. */
export function SpeechCheck() {
	const qc = useQueryClient();
	const check = useMutation({
		mutationFn: async () => {
			const status = await read(client.status.$get());
			qc.setQueryData(qk.status(), status);
			if (!status.speech.ok) throw new Error(status.speech.error ?? "接続できません");
			return status.speech;
		},
	});
	const speech = check.data;
	return (
		<CheckRow
			pending={check.isPending}
			onCheck={() => check.mutate()}
			done={
				speech &&
				`接続できました · 音声合成 ${speech.tts ?? "なし"} · 文字起こし ${speech.asr ?? "なし"}`
			}
			error={check.error}
		/>
	);
}

/** Lists the provider's models to see that the address and key work. */
export function ConnectionCheck({ provider }: { provider: LlmProvider }) {
	const qc = useQueryClient();
	const check = useMutation({
		mutationFn: () => read(client.chat["llm-models"].$get({ query: { provider } })),
		onSuccess: (models) => qc.setQueryData(qk.llmModels(provider), models),
	});
	return (
		<CheckRow
			pending={check.isPending}
			onCheck={() => check.mutate()}
			done={check.data && `接続できました · ${check.data.length} モデル`}
			error={check.error}
		/>
	);
}

function CheckRow({
	pending,
	onCheck,
	done,
	error,
}: {
	pending: boolean;
	onCheck: () => void;
	done: string | undefined;
	error: unknown;
}) {
	return (
		<SettingsRow
			label="接続"
			hint={done}
			control={
				<Button variant="outline" size="sm" disabled={pending} onClick={onCheck}>
					<RefreshCw className={pending ? "animate-spin" : ""} />
					確認
				</Button>
			}
		>
			<ErrorNote error={error} />
		</SettingsRow>
	);
}
