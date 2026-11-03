import {
	type ChatSettingsView,
	type ModelChoice,
	SUBSCRIPTION_PROVIDERS,
} from "@nextroom/contracts";
import { Badge } from "@nextroom/ui/components/badge";
import { Button } from "@nextroom/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@nextroom/ui/components/field";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { ApiModelPicker } from "@/components/api-model-picker";
import { SettingsSection } from "@/components/settings-section";
import { useOpenrouterImageModels } from "@/hooks/queries";
import { type ChatSettingsForm, ChatSettingsPage } from "./chat-settings";
import { ConnectionCheck, KeyField, KeyStatus, UrlField } from "./connection-fields";
import { LLM_LABELS, ModelChoiceFields } from "./model-choice";
import { NumberField } from "./settings-fields";
import { SubscriptionStatusRow } from "./subscription-sign-in";

const MAX_FALLBACKS = 5;

const keyOf = (c: ModelChoice) => `${c.provider}/${c.model}`;

/** The providers the app can reply through, and the models it uses. */
export default function ModelSettings() {
	return (
		<ChatSettingsPage>
			{(f) => (
				<>
					<ProvidersSection />
					<MainModelSection f={f} />
					<FallbackSection f={f} />
					<ApprovalModelSection f={f} />
					<ImageModelSections f={f} />
					<AdvancedSection f={f} />
				</>
			)}
		</ChatSettingsPage>
	);
}

/** One provider of the providers' list: its name, then its state and what can be done. */
function ProviderBlock({
	name,
	description,
	children,
}: {
	name: string;
	description?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3 border-t border-foreground/15 pt-4 first:border-t-0 first:pt-0">
			<div className="flex flex-col gap-0.5">
				<div className="text-sm font-extrabold">{name}</div>
				{description && <p className="m-0 text-xs text-muted-foreground">{description}</p>}
			</div>
			{children}
		</div>
	);
}

function ProvidersSection() {
	return (
		<SettingsSection
			title="プロバイダー"
			description="返答に使うサービスです。サブスクリプションはサインインで、ほかは API キーで使えます。キーを空にすると、サーバーの .env の値を使います。"
			className="gap-4"
		>
			<ProviderBlock name="サブスクリプション">
				<div className="flex flex-col">
					{SUBSCRIPTION_PROVIDERS.map((p) => (
						<div
							key={p}
							className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-foreground/15 py-2 first:pt-0 last:border-b-0 last:pb-0"
						>
							<span className="min-w-36 text-sm">{LLM_LABELS[p]}</span>
							<SubscriptionStatusRow provider={p} />
						</div>
					))}
				</div>
			</ProviderBlock>
			<ProviderBlock
				name="OpenRouter"
				description="返答のほか、画像の生成と表情の判定にも使います。"
			>
				<KeyField name="openrouter_key" />
				<ConnectionCheck provider="openrouter" />
			</ProviderBlock>
			<ProviderBlock name="Anthropic API">
				<KeyField name="anthropic_key" />
				<ConnectionCheck provider="anthropic" />
			</ProviderBlock>
			<ProviderBlock
				name="OpenAI 互換"
				description="Chat Completions に対応したサーバーです。Ollama は http://127.0.0.1:11434/v1、LM Studio は http://127.0.0.1:1234/v1 です。"
			>
				<UrlField
					name="openai_compatible_url"
					label="サーバーの URL"
					placeholder="http://127.0.0.1:11434/v1"
				/>
				<KeyField
					name="openai_compatible_key"
					label="API キー（任意）"
					description="ローカルの LLM なら空欄で構いません。"
					optional
				/>
				<ConnectionCheck provider="openai_compatible" />
			</ProviderBlock>
		</SettingsSection>
	);
}

/** Where a model is used, under the section's title. */
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

function MainModelSection({ f: { form, set } }: { f: ChatSettingsForm }) {
	return (
		<SettingsSection
			title="メインモデル"
			description={
				<Uses
					items={["キャラクターの返答", "記憶の要約", "キャラクターの生成", "好感度の下書き"]}
				/>
			}
		>
			<ModelChoiceFields
				id="main-model"
				value={form.main_model}
				onChange={(main_model) => set({ main_model })}
			/>
		</SettingsSection>
	);
}

function FallbackSection({ f: { form, set } }: { f: ChatSettingsForm }) {
	const [adding, setAdding] = useState(false);
	const list = form.fallback_models;
	const save = (next: ModelChoice[]) =>
		set({
			fallback_models: next.filter((c, i) => next.findIndex((d) => keyOf(d) === keyOf(c)) === i),
		});
	const move = (from: number, to: number) => {
		const next = [...list];
		const [item] = next.splice(from, 1);
		if (item) next.splice(to, 0, item);
		save(next);
	};

	return (
		<SettingsSection
			title="フォールバック"
			description="メインモデルが何も返さずに失敗したとき、上から順に試します。"
		>
			{list.map((choice, i) => (
				<div key={keyOf(choice)} className="flex flex-col gap-2 rounded-lg border-2 bg-muted p-3">
					<div className="flex items-center gap-1">
						<span className="mr-auto text-xs font-extrabold text-muted-foreground">{i + 1}</span>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="上へ移動"
							disabled={i === 0}
							onClick={() => move(i, i - 1)}
						>
							<ArrowUp />
						</Button>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="下へ移動"
							disabled={i === list.length - 1}
							onClick={() => move(i, i + 1)}
						>
							<ArrowDown />
						</Button>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="削除"
							className="text-destructive hover:text-destructive"
							onClick={() => save(list.filter((_, j) => j !== i))}
						>
							<Trash2 />
						</Button>
					</div>
					<ModelChoiceFields
						id={`fallback-${i}`}
						value={choice}
						onChange={(next) => save(list.map((c, j) => (j === i ? next : c)))}
					/>
				</div>
			))}
			{adding && (
				<div className="flex flex-col gap-2 rounded-lg border-2 border-dashed p-3">
					<div className="flex items-center">
						<span className="mr-auto text-xs font-extrabold text-muted-foreground">
							モデルを選ぶと追加されます
						</span>
						<Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
							やめる
						</Button>
					</div>
					<ModelChoiceFields
						id="fallback-new"
						value={null}
						onChange={(choice) => {
							setAdding(false);
							save([...list, choice]);
						}}
					/>
				</div>
			)}
			{!adding && (
				<Button
					variant="outline"
					size="sm"
					className="self-start"
					disabled={list.length >= MAX_FALLBACKS}
					onClick={() => setAdding(true)}
				>
					<Plus />
					フォールバックを追加
				</Button>
			)}
		</SettingsSection>
	);
}

function ApprovalModelSection({ f: { form, set } }: { f: ChatSettingsForm }) {
	return (
		<SettingsSection
			title="承認モデル"
			description={
				<>
					<Link to="/settings/approvals">承認</Link>
					の「自動」で、キャラクターの操作が依頼に合っているかを判断します。未設定なら「自動」は「確認」と同じになります。
				</>
			}
			action={
				form.approval_model && (
					<Button variant="ghost" size="sm" onClick={() => set({ approval_model: null })}>
						外す
					</Button>
				)
			}
		>
			<ModelChoiceFields
				id="approval-model"
				value={form.approval_model}
				onChange={(approval_model) => set({ approval_model })}
			/>
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

function OpenrouterKeyStatus() {
	return (
		<KeyStatus
			name="openrouter_key"
			service="OpenRouter"
			where="上の「プロバイダー」で API キーを入力してください"
		/>
	);
}

function ImageModelSections({ f: { form, set } }: { f: ChatSettingsForm }) {
	const field = (
		id: string,
		output: "image" | "decisions",
		key: keyof Pick<ChatSettingsView, "image_gen_model" | "image_tag_model">,
		note: string,
	) => (
		<Field>
			<FieldLabel htmlFor={id}>モデル</FieldLabel>
			<OpenrouterModelPicker
				id={id}
				output={output}
				value={form[key]}
				onChange={(model) => set({ [key]: model })}
			/>
			<FieldDescription className="text-xs">{note}</FieldDescription>
		</Field>
	);
	return (
		<>
			<SettingsSection
				title="画像の生成"
				description={<Uses items={["表情画像の「AI で作る」", "画像の送信"]} />}
				className="gap-5"
			>
				<OpenrouterKeyStatus />
				{field(
					"image-gen-model",
					"image",
					"image_gen_model",
					"参照画像を受け取れる OpenRouter の画像生成モデルから選びます。未選択では画像を作れません。",
				)}
			</SettingsSection>
			<SettingsSection
				title="表情の判定"
				description={<Uses items={["表情画像の「タグを判定」", "通話中の表情"]} />}
				className="gap-5"
			>
				<OpenrouterKeyStatus />
				{field(
					"image-tag-model",
					"decisions",
					"image_tag_model",
					"画像を読める OpenRouter の Decisions モデルから選びます。未選択ではタグを判定できず、通話中の表情も変わりません。",
				)}
			</SettingsSection>
		</>
	);
}

function AdvancedSection({ f: { form, set } }: { f: ChatSettingsForm }) {
	return (
		<SettingsSection
			title="詳細設定"
			description="すべてのキャラクターの返答に使います。"
			className="grid grid-cols-2 gap-3"
		>
			<NumberField
				id="llm-temperature"
				label="温度"
				description="高いほど言い回しが散らばります（0〜2）"
				value={form.temperature}
				step={0.1}
				min={0}
				max={2}
				onChange={(temperature) => set({ temperature })}
			/>
			<NumberField
				id="llm-max-tokens"
				label="最大トークン数"
				description="1回の返答の長さの上限（空欄でモデルの既定）"
				value={form.max_tokens}
				step={50}
				min={16}
				placeholder="指定なし"
				onChange={(max_tokens) => set({ max_tokens })}
				nullable
			/>
		</SettingsSection>
	);
}
