import type { LlmProvider } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, RefreshCw } from "lucide-react";
import { SettingsBody, SettingsSection } from "@/components/settings-section";
import { Dot, ErrorNote } from "@/components/status";
import { useChatSettings } from "@/hooks/queries";
import { client, read } from "@/lib/api";
import { qk } from "@/lib/query-keys";

/** The external services' addresses and API keys, read from the server's .env, which the other
 *  pages use. */
export default function ConnectionSettings() {
	const settings = useChatSettings();
	const s = settings.data;
	return (
		<SettingsBody>
			<p className="m-0 rounded-lg border-2 bg-selected px-3 py-2 text-xs">
				接続先と API キーは <span className="font-mono">apps/server/.env</span>{" "}
				に書きます（項目は同じ場所の <span className="font-mono">.env.schema</span>{" "}
				にあります）。変えたあとはサーバーを起動し直してください。
			</p>
			{!s ? (
				<ErrorNote error={settings.error} />
			) : (
				<>
					<SettingsSection
						title="OpenRouter"
						description="返答モデルで「OpenRouter」を選んだときと、画像の生成・画像のタグ付けに使います。"
						action={<KeyBadge isSet={s.has_openrouter_api_key} />}
						className="gap-5"
					>
						<EnvRow name="OPENROUTER_API_KEY" />
						<ConnectionCheck provider="openrouter" />
					</SettingsSection>

					<SettingsSection
						title="Anthropic"
						description="返答モデルで「Claude」を選んだときと、Claude Agent SDK（道具と権限）が API キーで動くときに使います。"
						action={<KeyBadge isSet={s.has_anthropic_api_key} />}
						className="gap-5"
					>
						<EnvRow name="ANTHROPIC_API_KEY" />
						<ConnectionCheck provider="anthropic" />
					</SettingsSection>

					<SettingsSection
						title="Exa"
						description="キャラクターの道具「Web 検索」に使います。"
						action={<KeyBadge isSet={s.has_exa_api_key} />}
					>
						<EnvRow name="EXA_API_KEY" />
					</SettingsSection>

					<SettingsSection
						title="Composio"
						description="キャラクターの道具「アプリ連携」（Gmail・Google カレンダーなど）に使います。"
						action={<KeyBadge isSet={s.has_composio_api_key} />}
					>
						<EnvRow name="COMPOSIO_API_KEY" />
					</SettingsSection>

					<SettingsSection
						title="ElevenLabs"
						description="読み上げ・聞き取りで「ElevenLabs」を選んだときと、キャラクターの声の画面で ElevenLabs の声を作るときに使います。"
						action={<KeyBadge isSet={s.has_elevenlabs_api_key} />}
						className="gap-5"
					>
						<EnvRow name="ELEVENLABS_API_KEY" />
						<ElevenlabsCheck />
					</SettingsSection>

					<SettingsSection
						title="speech.cpp"
						description={
							<>
								ローカルの読み上げ（Irodori-TTS）・聞き取りとボイスクローンに使う、別に起動した
								speech.cpp サーバー（speech serve
								--open）の接続先です。モデルは「モデル」で選びます。
								<a href="https://github.com/nyosegawa/speech.cpp" target="_blank" rel="noreferrer">
									speech.cpp（GitHub）
								</a>
							</>
						}
						className="gap-5"
					>
						<EnvRow name="SPEECH_URL" value={s.speech_url} />
						<SpeechCheck />
					</SettingsSection>

					<SettingsSection
						title="OpenAI 互換 API"
						description="返答モデルで「OpenAI 互換」を選んだときの接続先です。Ollama は http://127.0.0.1:11434/v1、LM Studio は http://127.0.0.1:1234/v1 です。"
						action={<KeyBadge isSet={s.has_api_key} optional />}
						className="gap-5"
					>
						<EnvRow name="OPENAI_COMPATIBLE_BASE_URL" value={s.base_url} />
						<EnvRow name="OPENAI_COMPATIBLE_API_KEY" note="ローカルの LLM なら空欄で可" />
						<ConnectionCheck provider="openai_compatible" />
					</SettingsSection>
				</>
			)}
		</SettingsBody>
	);
}

/** The .env variable a section reads, with the value it has when that can be shown. */
function EnvRow({ name, value, note }: { name: string; value?: string; note?: string }) {
	return (
		<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
			<span className="font-mono font-bold">{name}</span>
			{value !== undefined && (
				<span className="font-mono break-all text-muted-foreground">{value}</span>
			)}
			{note && <span className="text-xs text-muted-foreground">{note}</span>}
		</div>
	);
}

/** Whether the service's key is set; `optional`: it works without one (a local LLM). */
function KeyBadge({ isSet, optional }: { isSet: boolean; optional?: boolean }) {
	const base =
		"inline-flex h-6 items-center gap-1.5 rounded-full border-[1.5px] border-foreground/15 px-2.5 text-xs font-extrabold whitespace-nowrap";
	if (isSet)
		return (
			<span className={`${base} bg-pastel-mint`}>
				<Check className="size-3.5 text-success" strokeWidth={3.5} aria-hidden="true" />
				設定済み
			</span>
		);
	if (optional) return <span className={`${base} bg-pastel-sky`}>キーなし</span>;
	return <span className={`${base} border-dashed bg-pastel-peach`}>未設定</span>;
}

/** Lists the account's voices to see that the key works. */
function ElevenlabsCheck() {
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

/** Asks the speech.cpp server which models it holds. */
function SpeechCheck() {
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
function ConnectionCheck({ provider }: { provider: LlmProvider }) {
	const qc = useQueryClient();
	const check = useMutation({
		mutationFn: () => read(client.chat["llm-models"].$get({ query: { provider } })),
		onSuccess: (models) => {
			qc.setQueryData(qk.llmModels(provider), models);
			if (provider === "openrouter") qc.invalidateQueries({ queryKey: qk.openrouterImageModels() });
		},
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
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-3">
				<Button variant="outline" size="sm" disabled={pending} onClick={onCheck}>
					<RefreshCw className={pending ? "animate-spin" : ""} />
					接続を確認
				</Button>
				{done && <Dot tone="success">{done}</Dot>}
			</div>
			<ErrorNote error={error} />
		</div>
	);
}
