import {
	type LlmProvider,
	type ModelChoice,
	THINKING_LEVELS,
	type ThinkingLevel,
} from "@nextroom/contracts";
import { Field, FieldDescription, FieldLabel } from "@nextroom/ui/components/field";
import { useCallback, useState } from "react";
import { ApiModelPicker } from "@/components/api-model-picker";
import { SimpleSelect } from "@/components/simple-select";
import { useProviderLabel, useProviderOptions } from "@/features/settings/provider-labels";
import { useLlmModels } from "@/hooks/queries";

const THINKING_LABELS: Record<ThinkingLevel, string> = {
	off: "オフ",
	minimal: "最小",
	low: "低",
	medium: "中",
	high: "高",
	xhigh: "とても高い",
	max: "最大",
};

/** "OpenRouter · model（思考: 高）" */
export function useModelChoiceText(): (c: ModelChoice) => string {
	const label = useProviderLabel();
	return useCallback(
		(c) =>
			`${label(c.provider)} · ${c.model}${c.thinking ? `（思考: ${THINKING_LABELS[c.thinking]}）` : ""}`,
		[label],
	);
}

/** A model of its own, or none (null) to use `fallback`. A provider is only saved once a model
 *  of it is picked. */
export function ModelChoiceField({
	id,
	value,
	onChange,
	fallback,
	disabled,
}: {
	id: string;
	value: ModelChoice | null;
	onChange: (choice: ModelChoice | null) => void;
	/** What a missing choice means, e.g. "設定のメインモデル". */
	fallback: string;
	disabled?: boolean;
}) {
	// A provider picked before its model.
	const [picking, setPicking] = useState<LlmProvider | null>(null);
	const provider = picking ?? value?.provider ?? null;
	const options = useProviderOptions(provider);

	return (
		<div className="flex flex-col gap-4">
			<Field>
				<FieldLabel htmlFor={`${id}-provider`}>接続</FieldLabel>
				<SimpleSelect<LlmProvider>
					id={`${id}-provider`}
					value={provider}
					disabled={disabled}
					onChange={(p) => {
						if (p === null) {
							setPicking(null);
							if (value) onChange(null);
						} else if (p !== value?.provider) setPicking(p);
						else setPicking(null);
					}}
					options={[{ value: null, label: `${fallback}を使う` }, ...options]}
				/>
			</Field>
			{provider && (
				<ProviderModel
					key={provider}
					id={id}
					provider={provider}
					value={value?.provider === provider ? value : null}
					onChange={(choice) => {
						setPicking(null);
						onChange(choice);
					}}
				/>
			)}
		</div>
	);
}

function ProviderModel({
	id,
	provider,
	value,
	onChange,
}: {
	id: string;
	provider: LlmProvider;
	value: ModelChoice | null;
	onChange: (choice: ModelChoice) => void;
}) {
	const models = useLlmModels(provider);
	return (
		<div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
			<Field>
				<FieldLabel htmlFor={`${id}-model`}>モデル</FieldLabel>
				<ApiModelPicker
					id={`${id}-model`}
					models={models}
					value={value?.model ?? ""}
					onChange={(model) => onChange({ provider, model, thinking: value?.thinking ?? null })}
				/>
				{!value && (
					<FieldDescription className="text-xs text-warning">
						モデルを選ぶと保存されます
					</FieldDescription>
				)}
			</Field>
			<Field>
				<FieldLabel htmlFor={`${id}-thinking`}>思考</FieldLabel>
				<SimpleSelect<ThinkingLevel>
					id={`${id}-thinking`}
					value={value?.thinking ?? null}
					disabled={!value}
					onChange={(thinking) => value && onChange({ ...value, thinking })}
					options={[
						{ value: null, label: "モデルの既定" },
						...THINKING_LEVELS.map((t) => ({ value: t, label: THINKING_LABELS[t] })),
					]}
				/>
			</Field>
		</div>
	);
}
