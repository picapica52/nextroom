import { ASR_PROVIDERS, type AsrProvider, DEFAULT_SPEECH_URL } from "@nextroom/contracts";
import { Field, FieldDescription, FieldLabel } from "@nextroom/ui/components/field";
import { ProviderToggle } from "@/components/provider-toggle";
import { SettingsSection } from "@/components/settings-section";
import { SpeechModelPicker } from "@/components/speech-model";
import { type ChatSettingsForm, ChatSettingsPage } from "./chat-settings";
import { ElevenlabsCheck, KeyField, KeyStatus, SpeechCheck, UrlField } from "./connection-fields";
import { SwitchRow } from "./settings-fields";

const ASR_LABELS: Record<AsrProvider, string> = {
	parakeet: "speech.cpp",
	elevenlabs: "ElevenLabs Scribe",
};

/** Where speech is made and heard: the speech.cpp server, ElevenLabs, and what is spoken. */
export default function VoiceSettings() {
	return (
		<ChatSettingsPage>
			{(f) => (
				<>
					<SettingsSection
						title="speech.cpp"
						description={
							<>
								ローカルの読み上げ（Irodori-TTS）・文字起こしとボイスクローンに使う、別に起動した
								speech.cpp サーバー（speech serve --open）です。
								<a href="https://github.com/nyosegawa/speech.cpp" target="_blank" rel="noreferrer">
									speech.cpp（GitHub）
								</a>
							</>
						}
						className="gap-5"
					>
						<UrlField
							name="speech_url"
							label="サーバーの URL"
							placeholder={DEFAULT_SPEECH_URL}
							description="空にして保存すると、.env の値か既定の URL に戻ります。"
						/>
						<SpeechCheck />
					</SettingsSection>

					<SettingsSection
						title="ElevenLabs"
						description="文字起こしで「ElevenLabs Scribe」を選んだときと、キャラクターの声で ElevenLabs の声を使うときに使います。"
						className="gap-5"
					>
						<KeyField name="elevenlabs_key" />
						<ElevenlabsCheck />
					</SettingsSection>

					<SttSection f={f} />

					<SettingsSection>
						<SwitchRow
							id="tts-enabled"
							label="返答を読み上げる"
							description="オフにすると、すべての会話がテキストだけで返答します。"
							checked={f.form.tts_enabled}
							onChange={(tts_enabled) => f.set({ tts_enabled })}
						/>
						<SwitchRow
							id="face-changes-enabled"
							label="通話中に表情を変える"
							description="「表情の判定」のモデルが返答に合う表情を選びます。オフにすると、通話中の表情は変わりません。"
							checked={f.form.face_changes_enabled}
							onChange={(face_changes_enabled) => f.set({ face_changes_enabled })}
						/>
					</SettingsSection>
				</>
			)}
		</ChatSettingsPage>
	);
}

function SttSection({ f: { form, set } }: { f: ChatSettingsForm }) {
	const local = form.asr_provider === "parakeet";
	return (
		<SettingsSection
			title="文字起こし"
			description="チャットのマイクに使います。"
			className="gap-5"
		>
			<ProviderToggle
				label="実行先"
				providers={ASR_PROVIDERS}
				labels={ASR_LABELS}
				value={form.asr_provider}
				onChange={(asr_provider) => set({ asr_provider })}
			/>
			<Field>
				<FieldLabel htmlFor={local ? "asr-model" : undefined}>モデル</FieldLabel>
				{local ? (
					<SpeechModelPicker
						task="asr"
						id="asr-model"
						value={form.asr_model}
						onChange={(asr_model) => set({ asr_model })}
					/>
				) : (
					<>
						<FieldDescription className="text-xs">Scribe v2（日本語）</FieldDescription>
						<KeyStatus
							name="elevenlabs_key"
							service="ElevenLabs"
							where="上の「ElevenLabs」で API キーを入力してください"
						/>
					</>
				)}
			</Field>
		</SettingsSection>
	);
}
