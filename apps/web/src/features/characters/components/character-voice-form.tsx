import {
	type CharacterView,
	type CharacterVoice,
	ELEVENLABS_TTS_MODELS,
	FISH_AUDIO_TTS_MODELS,
	TTS_PROVIDERS,
	type TtsProvider,
} from "@nextroom/contracts";
import { Field, FieldDescription, FieldLabel } from "@nextroom/ui/components/field";
import { Link } from "react-router-dom";
import { ProviderToggle } from "@/components/provider-toggle";
import { SettingsSection } from "@/components/settings-section";
import { SimpleSelect } from "@/components/simple-select";
import { SpeechModelPicker } from "@/components/speech-model";
import { ErrorNote } from "@/components/status";
import { CaptionField, SpeedField } from "@/components/voice-fields";
import { useChatSettings } from "@/hooks/queries";
import { ELEVENLABS_TTS_MODEL_LABELS, FISH_AUDIO_TTS_MODEL_LABELS } from "@/lib/api";
import { useConnections } from "../queries";
import { ElevenlabsClone, ElevenlabsDesign, ElevenlabsVoiceField } from "./elevenlabs-voice";
import { FishAudioClone, FishAudioVoiceField } from "./fish-audio-voice";
import { VoiceFileField, VoiceRefs } from "./voice-refs";

const TTS_LABELS: Record<TtsProvider, string> = {
	irodori: "speech.cpp（Irodori-TTS）",
	elevenlabs: "ElevenLabs",
	fish_audio: "Fish Audio",
};

/**
 * What speaks the character and how it sounds: the provider and its model, the voice, then the
 * reference clips the voice is made from. Each change is saved as it is made; `update` receives
 * only the changed fields, and `error` is why the last save failed.
 */
export function CharacterVoiceForm({
	character,
	value,
	update,
	error,
}: {
	character: CharacterView;
	value: CharacterVoice;
	update: (changes: Partial<CharacterVoice>) => void;
	error: unknown;
}) {
	const settings = useChatSettings();
	const elevenlabs = value.provider === "elevenlabs";
	const fish = value.provider === "fish_audio";
	const connections = useConnections();
	const keys = connections.data?.keys;
	const hasKey = (fish ? keys?.fish_audio_key.set : keys?.elevenlabs_key.set) ?? false;

	return (
		<>
			<SettingsSection
				title="モデル"
				description="このキャラクターの声を作るモデルです。"
				className="gap-5"
			>
				<ErrorNote error={settings.error ?? error} />
				{settings.data?.tts_enabled === false && (
					<FieldDescription className="text-xs text-warning">
						読み上げがオフのため、会話ではこの声を使いません（
						<Link to="/settings/voice" className="text-warning">
							設定 → 音声
						</Link>
						でオンにできます）。
					</FieldDescription>
				)}
				<ProviderToggle
					label="実行先"
					providers={TTS_PROVIDERS}
					labels={TTS_LABELS}
					value={value.provider}
					onChange={(provider) => update({ provider })}
				/>
				<Field>
					<FieldLabel htmlFor={`${value.provider}-tts-model`}>モデル</FieldLabel>
					{fish ? (
						<SimpleSelect
							id="fish_audio-tts-model"
							value={value.fish_audio_model || null}
							onChange={(fish_audio_model) => fish_audio_model && update({ fish_audio_model })}
							placeholder="モデルを選ぶ"
							options={FISH_AUDIO_TTS_MODELS.map((m) => ({
								value: m,
								label: FISH_AUDIO_TTS_MODEL_LABELS[m],
							}))}
						/>
					) : elevenlabs ? (
						<SimpleSelect
							id="elevenlabs-tts-model"
							value={value.elevenlabs_model || null}
							onChange={(elevenlabs_model) => elevenlabs_model && update({ elevenlabs_model })}
							placeholder="モデルを選ぶ"
							options={ELEVENLABS_TTS_MODELS.map((m) => ({
								value: m,
								label: ELEVENLABS_TTS_MODEL_LABELS[m],
							}))}
						/>
					) : (
						<SpeechModelPicker
							task="tts"
							id="irodori-tts-model"
							value={value.irodori_model}
							onChange={(irodori_model) => update({ irodori_model })}
						/>
					)}
				</Field>
			</SettingsSection>

			<SettingsSection
				title="声"
				description={
					elevenlabs
						? "ElevenLabs のアカウントにある声から選びます。"
						: fish
							? "Fish Audio のアカウントの声か、公開されている声から選びます。"
							: undefined
				}
				className="gap-5"
			>
				{!elevenlabs && !fish ? (
					<IrodoriVoiceFields character={character} value={value} update={update} />
				) : !hasKey ? (
					connections.data && (
						<FieldDescription className="text-xs">
							{fish ? "Fish Audio" : "ElevenLabs"} の API キーを
							<Link to="/settings/voice">設定 → 音声</Link>
							で入力すると使えます。
						</FieldDescription>
					)
				) : fish ? (
					<>
						<FishAudioVoiceField
							model={value.fish_audio_model}
							value={value.fish_audio_voice_id}
							onChange={(fish_audio_voice_id) => update({ fish_audio_voice_id })}
						/>
						<FishAudioClone
							characterId={character.id}
							name={character.persona.name}
							onCreated={(fish_audio_voice_id) => update({ fish_audio_voice_id })}
						/>
						<SpeedField
							value={value.speed}
							min={0.5}
							max={2}
							onChange={(speed) => update({ speed })}
						/>
					</>
				) : (
					<>
						<ElevenlabsVoiceField
							model={value.elevenlabs_model}
							value={value.elevenlabs_voice_id}
							onChange={(elevenlabs_voice_id) => update({ elevenlabs_voice_id })}
						/>
						<ElevenlabsClone
							characterId={character.id}
							name={character.persona.name}
							onCreated={(elevenlabs_voice_id) => update({ elevenlabs_voice_id })}
						/>
						<ElevenlabsDesign
							characterId={character.id}
							name={character.persona.name}
							onCreated={(elevenlabs_voice_id) => update({ elevenlabs_voice_id })}
						/>
						<SpeedField
							value={value.speed}
							min={0.7}
							max={1.2}
							onChange={(speed) => update({ speed })}
						/>
					</>
				)}
			</SettingsSection>

			<SettingsSection
				title="参照音声"
				description="Voice Clone のボイスファイルと、ElevenLabs・Fish Audio の複製に使います。"
			>
				<VoiceRefs characterId={character.id} />
			</SettingsSection>
		</>
	);
}

function IrodoriVoiceFields({
	character,
	value,
	update,
}: {
	character: CharacterView;
	value: CharacterVoice;
	update: (changes: Partial<CharacterVoice>) => void;
}) {
	return (
		<>
			<VoiceFileField characterId={character.id} />
			<SpeedField value={value.speed} onChange={(speed) => update({ speed })} />
			<CaptionField value={value.caption} onChange={(caption) => update({ caption })} />
		</>
	);
}
