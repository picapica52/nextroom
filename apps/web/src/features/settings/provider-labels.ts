import {
	type LlmProvider,
	OPENAI_COMPATIBLE,
	THINKING_LEVELS,
	type ThinkingLevel,
} from "@nextroom/contracts";
import { useCallback, useMemo } from "react";
import { useProviders } from "@/hooks/queries";

/** The provider's name, as pi gives it. */
export function useProviderLabel(): (provider: LlmProvider) => string {
	const providers = useProviders().data;
	return useCallback(
		(provider) =>
			provider === OPENAI_COMPATIBLE
				? "OpenAI 互換"
				: (providers?.find((p) => p.id === provider)?.name ?? provider),
		[providers],
	);
}

/** The providers a model can be chosen from: those set up, the OpenAI-compatible endpoint, and
 *  `current`, even when it no longer is. */
export function useProviderOptions(current?: LlmProvider | null) {
	const providers = useProviders().data;
	const label = useProviderLabel();
	return useMemo(() => {
		const ids = (providers ?? []).filter((p) => p.configured).map((p) => p.id);
		ids.push(OPENAI_COMPATIBLE);
		if (current && !ids.includes(current)) ids.push(current);
		return ids.map((p) => ({ value: p, label: label(p) }));
	}, [providers, current, label]);
}

export const THINKING_LABELS: Record<ThinkingLevel, string> = {
	off: "オフ",
	minimal: "最小",
	low: "低",
	medium: "中",
	high: "高",
	xhigh: "とても高い",
	max: "最大",
};

/** The choices of the thinking select, the model's own default first. */
export const THINKING_OPTIONS = [
	{ value: null, label: "モデルの既定" },
	...THINKING_LEVELS.map((t) => ({ value: t, label: THINKING_LABELS[t] })),
];
