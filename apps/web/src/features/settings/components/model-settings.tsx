import type { ImageModelChoice, LlmProvider, ModelChoice } from "@nextroom/contracts";
import { Button, buttonVariants } from "@nextroom/ui/components/button";
import { Field, FieldLabel } from "@nextroom/ui/components/field";
import { cn } from "@nextroom/ui/lib/utils";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiModelPicker } from "@/components/api-model-picker";
import { SimpleSelect } from "@/components/simple-select";
import { useImageModels, useImageProviders } from "@/hooks/queries";
import { settingsPath } from "../pages";
import { type ChatSettingsForm, ChatSettingsPage } from "./chat-settings";
import { useHasLlmProvider } from "./connection-fields";
import { ModelChoiceFields } from "./model-choice";
import { NumberField } from "./settings-fields";
import { SettingsBlock, SettingsGroup } from "./settings-layout";

const MAX_FALLBACKS = 5;

const keyOf = (c: ModelChoice) => `${c.provider}/${c.model}`;

/** The model the characters talk with, the ones tried when it fails, and how they are run. */
export default function ModelSettings() {
	const ready = useHasLlmProvider();
	return (
		<ChatSettingsPage>
			{(f) => (
				<>
					{ready === false && (
						<div className="flex flex-wrap items-center gap-3 rounded-xl border-2 bg-pastel-peach px-4 py-3 text-sm shadow-puff">
							<span className="min-w-0 flex-1">
								モデルを選ぶには、まず AI のプロバイダーに接続してください。
							</span>
							<Link
								to={settingsPath("connections")}
								className={cn(buttonVariants({ size: "sm" }), "no-underline")}
							>
								接続を開く
							</Link>
						</div>
					)}
					<SettingsGroup
						id="main-model"
						title="メインモデル"
						description="キャラクターが会話に使うモデル（キャラクターごとに変えることもできます）"
					>
						<SettingsBlock>
							<ModelChoiceFields
								id="main"
								value={f.form.main_model}
								onChange={(main_model) => f.set({ main_model })}
							/>
						</SettingsBlock>
					</SettingsGroup>
					<FallbackGroup f={f} />
					<ImageModelGroup f={f} />
					<AdvancedGroup f={f} />
				</>
			)}
		</ChatSettingsPage>
	);
}

/** The models tried in turn when the main one fails before saying anything. */
function FallbackGroup({ f: { form, set } }: { f: ChatSettingsForm }) {
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
		<SettingsGroup
			id="fallbacks"
			title="フォールバック"
			description="メインモデルが返答を始める前に失敗したとき、上から順に試します"
		>
			{list.map((choice, i) => (
				<SettingsBlock key={keyOf(choice)}>
					<div className="flex items-center gap-1">
						<span className="mr-auto text-xs text-muted-foreground">フォールバック {i + 1}</span>
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
				</SettingsBlock>
			))}
			{adding ? (
				<SettingsBlock>
					<div className="flex items-center">
						<span className="mr-auto text-xs text-muted-foreground">
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
				</SettingsBlock>
			) : (
				list.length < MAX_FALLBACKS && (
					<SettingsBlock className="py-2">
						<Button
							variant="ghost"
							size="sm"
							className="self-start"
							onClick={() => setAdding(true)}
						>
							<Plus />
							フォールバックを追加
						</Button>
					</SettingsBlock>
				)
			)}
		</SettingsGroup>
	);
}

/** The image model the photos the characters send are drawn with, from pi's image models. */
function ImageModelGroup({ f: { form, set } }: { f: ChatSettingsForm }) {
	const providers = useImageProviders();
	const value = form.image_model;
	const usable = (providers.data ?? []).filter((p) => p.configured || p.id === value?.provider);
	const [draft, setDraft] = useState<LlmProvider>();
	const provider = draft ?? value?.provider ?? usable[0]?.id ?? null;
	const models = useImageModels(provider ?? "", !!provider);
	const choose = (choice: ImageModelChoice) => {
		setDraft(undefined);
		set({ image_model: choice });
	};
	return (
		<SettingsGroup
			id="image-model"
			title="画像の生成"
			description="キャラクターが写真を送るときに使うモデル（設定 → 道具 の「写真を送る」）"
		>
			<SettingsBlock>
				{providers.isSuccess && !usable.length ? (
					<p className="m-0 text-xs text-muted-foreground">
						画像のモデルがあるプロバイダー（
						{(providers.data ?? []).map((p) => p.name).join("・") || "なし"}
						）を
						<Link to={settingsPath("connections")}>接続</Link>
						で設定すると選べます。
					</p>
				) : (
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
						<Field>
							<FieldLabel htmlFor="image-provider" className="text-xs text-muted-foreground">
								プロバイダー
							</FieldLabel>
							<SimpleSelect<LlmProvider>
								id="image-provider"
								value={provider}
								onChange={(next) => next && setDraft(next)}
								options={usable.map((p) => ({ value: p.id, label: p.name }))}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="image-model" className="text-xs text-muted-foreground">
								モデル
							</FieldLabel>
							<ApiModelPicker
								id="image-model"
								models={models}
								value={value && value.provider === provider ? value.model : ""}
								onChange={(model) => provider && choose({ provider, model })}
							/>
						</Field>
					</div>
				)}
			</SettingsBlock>
		</SettingsGroup>
	);
}

function AdvancedGroup({ f: { form, set } }: { f: ChatSettingsForm }) {
	return (
		<SettingsGroup title="詳細" description="ふつうは変えなくて大丈夫です">
			<NumberField
				id="llm-temperature"
				label="温度（0〜2）"
				value={form.temperature}
				step={0.1}
				min={0}
				max={2}
				onChange={(temperature) => set({ temperature })}
			/>
			<NumberField
				id="llm-max-tokens"
				label="最大トークン数"
				description="空欄でモデルの既定"
				value={form.max_tokens}
				step={50}
				min={16}
				placeholder="指定なし"
				onChange={(max_tokens) => set({ max_tokens })}
				nullable
			/>
		</SettingsGroup>
	);
}
