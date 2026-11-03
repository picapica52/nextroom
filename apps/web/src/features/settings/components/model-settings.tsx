import {
	type ModelChoice,
	type PiProviderStatus,
	SUBSCRIPTION_PROVIDERS,
} from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Dot } from "@/components/status";
import { useConnections, usePiProviders, useSubscriptions } from "@/hooks/queries";
import { APP_PROVIDER_LABELS } from "../provider-labels";
import { type ChatSettingsForm, ChatSettingsPage } from "./chat-settings";
import { ConnectionCheck, KeyBadge, KeyField, UrlField } from "./connection-fields";
import { ModelChoiceFields } from "./model-choice";
import { NumberField } from "./settings-fields";
import {
	SettingsBlock,
	SettingsDisclosure,
	SettingsGroup,
	SettingsInset,
	SettingsRow,
} from "./settings-layout";
import { PiProviderRow, SubscriptionStatusRow } from "./subscription-sign-in";

const MAX_FALLBACKS = 5;

const keyOf = (c: ModelChoice) => `${c.provider}/${c.model}`;

/** The models the app uses, and the providers it reaches them through. */
export default function ModelSettings() {
	// Until a provider is connected the models cannot be listed, so the providers come first.
	const signedIn = useSubscriptions().data?.some((s) => s.signed_in);
	const keys = useConnections().data?.keys;
	const pi = usePiProviders().data?.some((p) => p.configured);
	const connected =
		signedIn || pi || keys?.openrouter_key?.set || keys?.anthropic_key?.set || keys === undefined;
	return (
		<ChatSettingsPage>
			{(f) => (
				<>
					{!connected && <ProvidersGroup />}
					<MainModelGroup f={f} />
					<ApprovalModelGroup f={f} />
					{connected && <ProvidersGroup />}
					<AdvancedGroup f={f} />
				</>
			)}
		</ChatSettingsPage>
	);
}

/** The main model, then the fallbacks tried in turn when it fails before saying anything. */
function MainModelGroup({ f: { form, set } }: { f: ChatSettingsForm }) {
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
		<SettingsGroup title="メインモデル">
			<SettingsBlock>
				<ModelChoiceFields
					id="main-model"
					value={form.main_model}
					onChange={(main_model) => set({ main_model })}
				/>
			</SettingsBlock>
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
							className="self-start text-muted-foreground"
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

function ApprovalModelGroup({ f: { form, set } }: { f: ChatSettingsForm }) {
	return (
		<SettingsGroup
			title="承認モデル"
			action={
				form.approval_model && (
					<Button variant="ghost" size="sm" onClick={() => set({ approval_model: null })}>
						外す
					</Button>
				)
			}
		>
			<SettingsBlock>
				<ModelChoiceFields
					id="approval-model"
					value={form.approval_model}
					onChange={(approval_model) => set({ approval_model })}
				/>
			</SettingsBlock>
		</SettingsGroup>
	);
}

function ProvidersGroup() {
	return (
		<SettingsGroup title="プロバイダー">
			{SUBSCRIPTION_PROVIDERS.map((p) => (
				<SettingsRow
					key={p}
					label={APP_PROVIDER_LABELS[p]}
					control={<SubscriptionStatusRow provider={p} />}
				/>
			))}
			<SettingsDisclosure label="OpenRouter" status={<KeyBadge name="openrouter_key" />}>
				<SettingsInset>
					<KeyField name="openrouter_key" />
					<ConnectionCheck provider="openrouter" />
				</SettingsInset>
			</SettingsDisclosure>
			<SettingsDisclosure label="Anthropic API" status={<KeyBadge name="anthropic_key" />}>
				<SettingsInset>
					<KeyField name="anthropic_key" />
					<ConnectionCheck provider="anthropic" />
				</SettingsInset>
			</SettingsDisclosure>
			<SettingsDisclosure label="OpenAI 互換（Ollama・LM Studio など）">
				<SettingsInset>
					<UrlField
						name="openai_compatible_url"
						label="URL"
						placeholder="http://127.0.0.1:11434/v1"
					/>
					<KeyField name="openai_compatible_key" label="API キー（任意）" optional />
					<ConnectionCheck provider="openai_compatible" />
				</SettingsInset>
			</SettingsDisclosure>
			<PiProvidersDisclosure />
		</SettingsGroup>
	);
}

/** Every other provider pi offers (Groq, Gemini, Mistral, OpenCode, Meta, ...). */
function PiProvidersDisclosure() {
	const providers = usePiProviders().data ?? [];
	const configured = providers.filter((p) => p.configured).length;
	return (
		<SettingsDisclosure
			label="その他のプロバイダー"
			status={configured > 0 && <Dot tone="success">{configured} 件設定済み</Dot>}
		>
			<p className="m-0 text-xs text-muted-foreground">
				API キーを入力するかサインインすると、モデルの選択に出てきます。apps/server/.env
				にあるキーも使われます。
			</p>
			<SettingsInset>
				{providers.map((p) => (
					<PiProviderSettings key={p.id} provider={p} />
				))}
			</SettingsInset>
		</SettingsDisclosure>
	);
}

function PiProviderSettings({ provider }: { provider: PiProviderStatus }) {
	return <SettingsRow label={provider.name} control={<PiProviderRow provider={provider} />} />;
}

function AdvancedGroup({ f: { form, set } }: { f: ChatSettingsForm }) {
	return (
		<SettingsGroup>
			<SettingsDisclosure label="詳細">
				<SettingsInset>
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
				</SettingsInset>
			</SettingsDisclosure>
		</SettingsGroup>
	);
}
