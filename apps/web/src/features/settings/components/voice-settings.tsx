import { ASR_PROVIDERS, type AsrProvider } from "@nextroom/contracts";
import { SpeechModelPicker } from "@/components/speech-model";
import { type ChatSettingsForm, ChatSettingsPage } from "./chat-settings";
import { MissingKey } from "./connection-fields";
import { Segmented, SwitchRow } from "./settings-fields";
import { SettingsGroup, SettingsRow } from "./settings-layout";

const ASR_LABELS: Record<AsrProvider, string> = {
	parakeet: "speech.cpp",
	elevenlabs: "ElevenLabs",
	fishaudio: "Fish Audio",
};

/** The model and the key of each provider other than speech.cpp. */
const ASR_CLOUD = {
	elevenlabs: { model: "Scribe v2", key: "elevenlabs_key", service: "ElevenLabs" },
	fishaudio: { model: "transcribe-1-pro", key: "fish_audio_key", service: "Fish Audio" },
} as const;

/** What is spoken and heard. Where (the speech.cpp server and the services' keys) is in 接続. */
export default function VoiceSettings() {
	return (
		<ChatSettingsPage>
			{(f) => (
				<>
					<SettingsGroup
						title="読み上げ"
						description="声はキャラクターごとに、キャラクターの「声」で選びます"
					>
						<SwitchRow
							id="tts-enabled"
							label="返答を読み上げる"
							checked={f.form.tts_enabled}
							onChange={(tts_enabled) => f.set({ tts_enabled })}
						/>
					</SettingsGroup>
					<SttGroup f={f} />
				</>
			)}
		</ChatSettingsPage>
	);
}

function SttGroup({ f: { form, set } }: { f: ChatSettingsForm }) {
	const cloud = form.asr_provider === "parakeet" ? null : ASR_CLOUD[form.asr_provider];
	const local = !cloud;
	return (
		<SettingsGroup id="stt" title="文字起こし" description="マイクで話した声を文字にします">
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
						<span className="text-sm text-muted-foreground">{cloud?.model}</span>
					)
				}
			>
				{cloud && <MissingKey name={cloud.key} service={cloud.service} />}
			</SettingsRow>
		</SettingsGroup>
	);
}
