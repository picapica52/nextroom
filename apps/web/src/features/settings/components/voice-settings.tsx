import { ASR_PROVIDERS, type AsrProvider, DEFAULT_SPEECH_URL } from "@nextroom/contracts";
import { SpeechModelPicker } from "@/components/speech-model";
import { type ChatSettingsForm, ChatSettingsPage } from "./chat-settings";
import {
	ElevenlabsCheck,
	FishAudioCheck,
	KeyBadge,
	KeyField,
	MissingKey,
	SpeechCheck,
	UrlField,
} from "./connection-fields";
import { Segmented, SwitchRow } from "./settings-fields";
import { SettingsDisclosure, SettingsGroup, SettingsInset, SettingsRow } from "./settings-layout";

const ASR_LABELS: Record<AsrProvider, string> = {
	parakeet: "speech.cpp",
	elevenlabs: "ElevenLabs",
};

/** What is spoken and heard, and where: the speech.cpp server, ElevenLabs and Fish Audio. */
export default function VoiceSettings() {
	return (
		<ChatSettingsPage>
			{(f) => (
				<>
					<SettingsGroup title="読み上げ">
						<SwitchRow
							id="tts-enabled"
							label="返答を読み上げる"
							checked={f.form.tts_enabled}
							onChange={(tts_enabled) => f.set({ tts_enabled })}
						/>
					</SettingsGroup>
					<SttGroup f={f} />
					<SettingsGroup title="接続">
						<SettingsDisclosure label="speech.cpp サーバー">
							<SettingsInset>
								<UrlField name="speech_url" label="URL" placeholder={DEFAULT_SPEECH_URL} />
								<SpeechCheck />
							</SettingsInset>
						</SettingsDisclosure>
						<SettingsDisclosure label="ElevenLabs" status={<KeyBadge name="elevenlabs_key" />}>
							<SettingsInset>
								<KeyField name="elevenlabs_key" />
								<ElevenlabsCheck />
							</SettingsInset>
						</SettingsDisclosure>
						<SettingsDisclosure label="Fish Audio" status={<KeyBadge name="fish_audio_key" />}>
							<SettingsInset>
								<KeyField name="fish_audio_key" />
								<FishAudioCheck />
							</SettingsInset>
						</SettingsDisclosure>
					</SettingsGroup>
				</>
			)}
		</ChatSettingsPage>
	);
}

function SttGroup({ f: { form, set } }: { f: ChatSettingsForm }) {
	const local = form.asr_provider === "parakeet";
	return (
		<SettingsGroup title="文字起こし">
			<SettingsRow
				label="実行先"
				control={
					<Segmented
						label="文字起こしの実行先"
						options={ASR_PROVIDERS.map((p) => ({ value: p, label: ASR_LABELS[p] }))}
						value={form.asr_provider}
						onChange={(asr_provider) => set({ asr_provider })}
					/>
				}
			/>
			<SettingsRow
				label="モデル"
				htmlFor={local ? "asr-model" : undefined}
				control={
					local ? (
						<div className="w-72 max-w-full">
							<SpeechModelPicker
								task="asr"
								id="asr-model"
								value={form.asr_model}
								onChange={(asr_model) => set({ asr_model })}
							/>
						</div>
					) : (
						<span className="text-sm text-muted-foreground">Scribe v2</span>
					)
				}
			>
				{!local && (
					<MissingKey
						name="elevenlabs_key"
						service="ElevenLabs"
						where="下の「接続」で入力します。"
					/>
				)}
			</SettingsRow>
		</SettingsGroup>
	);
}
