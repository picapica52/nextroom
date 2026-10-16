import {
	ASR_PROVIDERS,
	type AsrProvider,
	type ChatSettingsView,
	LLM_MODEL_FIELDS,
	LLM_PROVIDERS,
	type LlmProvider,
} from "@nextroom/contracts";
import { Badge } from "@nextroom/ui/components/badge";
import { Field, FieldDescription, FieldLabel } from "@nextroom/ui/components/field";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ApiModelPicker } from "@/components/api-model-picker";
import { ProviderToggle } from "@/components/provider-toggle";
import { SettingsSection } from "@/components/settings-section";
import { SpeechModelPicker } from "@/components/speech-model";
import { useLlmModels, useOpenrouterImageModels } from "@/hooks/queries";
import { type ChatSettingsForm, ChatSettingsPage, ConnectionStatus } from "./chat-settings";

const LLM_LABELS: Record<LlmProvider, string> = {
	anthropic: "Claude（Anthropic）",
	openai_compatible: "OpenAI 互換",
	openrouter: "OpenRouter",
};

const ASR_LABELS: Record<AsrProvider, string> = {
	parakeet: "speech.cpp",
	elevenlabs: "ElevenLabs Scribe",
};

/** The service of a provider that uses a key of the connection settings, and whether it is set. */
const serviceOf = (s: ChatSettingsView) =>
	s.provider === "anthropic"
		? { name: "Anthropic", isSet: s.has_anthropic_api_key }
		: s.provider === "openrouter"
			? { name: "OpenRouter", isSet: s.has_openrouter_api_key }
			: null;

/** Every model the app uses, grouped by what it makes; how they are used is on the other pages. */
export default function ModelSettings() {
	return (
		<ChatSettingsPage>
			{(f) => (
				<>
					<GroupLabel>返答</GroupLabel>
					<ReplyModelSection f={f} />
					<GroupLabel>画像</GroupLabel>
					<ImageGenSection f={f} />
					<ImageTagSection f={f} />
					<GroupLabel>音声</GroupLabel>
					<SttSection f={f} />
				</>
			)}
		</ChatSettingsPage>
	);
}

function GroupLabel({ children }: { children: ReactNode }) {
	return (
		<h2 className="-mb-2 px-1 text-xs font-bold tracking-wider text-muted-foreground">
			{children}
		</h2>
	);
}

/** Where the model is used, under the section's title. */
function Uses({ items }: { items: string[] }) {
	return (
		<span className="mt-1 flex flex-wrap gap-1.5">
			{items.map((u) => (
				<Badge key={u} variant="outline" className="font-medium">
					{u}
				</Badge>
			))}
		</span>
	);
}

function ReplyModelSection({ f: { form, set } }: { f: ChatSettingsForm }) {
	const service = serviceOf(form);
	const modelField = LLM_MODEL_FIELDS[form.provider];
	const models = useLlmModels(form.provider);
	return (
		<SettingsSection
			title="返答モデル"
			description={
				<Uses
					items={["キャラクターの返答", "記憶の要約", "キャラクターの生成", "好感度の下書き"]}
				/>
			}
			className="gap-5"
		>
			<ProviderToggle
				label="接続"
				providers={LLM_PROVIDERS}
				labels={LLM_LABELS}
				value={form.provider}
				onChange={(provider) => set({ provider })}
			/>
			{service ? (
				<ConnectionStatus {...service} />
			) : (
				<FieldDescription className="-mt-3 text-xs">
					<span className="font-mono">{form.base_url}</span>（URL とキーは .env で設定）
				</FieldDescription>
			)}
			<Field>
				<FieldLabel htmlFor="llm-model">モデル</FieldLabel>
				<ApiModelPicker
					id="llm-model"
					models={models}
					value={form[modelField]}
					onChange={(model) => set({ [modelField]: model })}
				/>
				<FieldDescription className="text-xs">
					温度・長さ・Effort は<Link to="/settings/reply">「返答のしかた」</Link>で変えます。
				</FieldDescription>
			</Field>
		</SettingsSection>
	);
}

/** One of OpenRouter's models that take an image and give `output`. */
function OpenrouterModelPicker({
	output,
	...props
}: {
	id: string;
	output: "image" | "decisions";
	value: string;
	onChange: (model: string) => void;
}) {
	const models = useOpenrouterImageModels(output);
	return <ApiModelPicker {...props} models={models} className="max-w-md" />;
}

function ImageGenSection({ f: { form, set } }: { f: ChatSettingsForm }) {
	return (
		<SettingsSection
			title="画像の生成"
			description={<Uses items={["表情画像の「AI で作る」", "道具「画像生成」"]} />}
			className="gap-5"
		>
			<ConnectionStatus name="OpenRouter" isSet={form.has_openrouter_api_key} />
			<Field>
				<FieldLabel htmlFor="image-gen-model">モデル</FieldLabel>
				<OpenrouterModelPicker
					id="image-gen-model"
					output="image"
					value={form.image_gen_model}
					onChange={(image_gen_model) => set({ image_gen_model })}
				/>
				<FieldDescription className="text-xs">
					参照画像を受け取れる OpenRouter の画像生成モデルから選びます。未選択では画像を作れません。
				</FieldDescription>
			</Field>
		</SettingsSection>
	);
}

function ImageTagSection({ f: { form, set } }: { f: ChatSettingsForm }) {
	return (
		<SettingsSection
			title="画像のタグ付け"
			description={<Uses items={["表情画像の「タグを判定」"]} />}
			className="gap-5"
		>
			<ConnectionStatus name="OpenRouter" isSet={form.has_openrouter_api_key} />
			<Field>
				<FieldLabel htmlFor="image-tag-model">モデル</FieldLabel>
				<OpenrouterModelPicker
					id="image-tag-model"
					output="decisions"
					value={form.image_tag_model}
					onChange={(image_tag_model) => set({ image_tag_model })}
				/>
				<FieldDescription className="text-xs">
					画像を読める OpenRouter の Decisions モデルから選びます。未選択ではタグを判定できません。
				</FieldDescription>
			</Field>
		</SettingsSection>
	);
}

function SttSection({ f: { form, set } }: { f: ChatSettingsForm }) {
	const local = form.asr_provider === "parakeet";
	return (
		<SettingsSection
			title="Speech To Text"
			description={<Uses items={["チャットのマイク"]} />}
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
						<ConnectionStatus isSet={form.has_elevenlabs_api_key} name="ElevenLabs" />
					</>
				)}
			</Field>
		</SettingsSection>
	);
}
