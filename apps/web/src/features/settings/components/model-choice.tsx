import {
	type LlmProvider,
	type ModelChoice,
	OPENAI_COMPATIBLE,
	THINKING_LEVELS,
	type ThinkingLevel,
} from "@nextroom/contracts";
import { Field, FieldLabel } from "@nextroom/ui/components/field";
import { cn } from "@nextroom/ui/lib/utils";
import { useState } from "react";
import { ApiModelPicker } from "@/components/api-model-picker";
import { SimpleSelect } from "@/components/simple-select";
import { useLlmModels, useProviders } from "@/hooks/queries";
import { useProviderOptions } from "../provider-labels";

const THINKING_LABELS: Record<ThinkingLevel, string> = {
	off: "オフ",
	minimal: "最小",
	low: "低",
	medium: "中",
	high: "高",
	xhigh: "非常に高い",
	max: "最大",
};

/** The provider a new choice starts from: one already set up, else the OpenAI-compatible endpoint. */
function useUsableProvider(): LlmProvider {
	return useProviders().data?.find((p) => p.configured)?.id ?? OPENAI_COMPATIBLE;
}

/** A provider, one of its models and how hard it thinks. Until a model is picked nothing is saved;
 *  a new provider waits for its model the same way. */
export function ModelChoiceFields({
	id,
	value,
	onChange,
	className,
}: {
	id: string;
	value: ModelChoice | null;
	onChange: (choice: ModelChoice) => void;
	className?: string;
}) {
	const [draft, setDraft] = useState<{ provider: LlmProvider; thinking: ThinkingLevel | null }>();
	const usable = useUsableProvider();
	const provider = draft?.provider ?? value?.provider ?? usable;
	const saved = value && value.provider === provider ? value : null;
	const thinking = saved ? saved.thinking : (draft?.thinking ?? value?.thinking ?? null);
	const models = useLlmModels(provider);
	const options = useProviderOptions(provider);

	return (
		<div className={cn("grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)_8rem]", className)}>
			<Field>
				<FieldLabel htmlFor={`${id}-provider`} className="text-xs text-muted-foreground">
					プロバイダー
				</FieldLabel>
				<SimpleSelect<LlmProvider>
					id={`${id}-provider`}
					value={provider}
					onChange={(next) => next && setDraft({ provider: next, thinking })}
					options={options}
				/>
			</Field>
			<Field>
				<FieldLabel htmlFor={`${id}-model`} className="text-xs text-muted-foreground">
					モデル
				</FieldLabel>
				<ApiModelPicker
					id={`${id}-model`}
					models={models}
					value={saved?.model ?? ""}
					onChange={(model) => {
						setDraft(undefined);
						onChange({ provider, model, thinking });
					}}
				/>
			</Field>
			<Field>
				<FieldLabel htmlFor={`${id}-thinking`} className="text-xs text-muted-foreground">
					思考
				</FieldLabel>
				<SimpleSelect<ThinkingLevel>
					id={`${id}-thinking`}
					value={thinking}
					onChange={(next) =>
						saved ? onChange({ ...saved, thinking: next }) : setDraft({ provider, thinking: next })
					}
					options={[
						{ value: null, label: "モデルの既定" },
						...THINKING_LEVELS.map((t) => ({ value: t, label: THINKING_LABELS[t] })),
					]}
				/>
			</Field>
		</div>
	);
}
