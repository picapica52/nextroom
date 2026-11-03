import {
	APP_PROVIDERS,
	type AppProvider,
	isPiProvider,
	type LlmProvider,
} from "@nextroom/contracts";
import { useCallback, useMemo } from "react";
import { usePiProviders } from "@/hooks/queries";

export const APP_PROVIDER_LABELS: Record<AppProvider, string> = {
	chatgpt: "ChatGPT（サブスク）",
	claude: "Claude（サブスク）",
	copilot: "GitHub Copilot",
	grok: "SuperGrok",
	openrouter: "OpenRouter",
	anthropic: "Anthropic API",
	openai_compatible: "OpenAI 互換",
};

/** The provider's name: the app's own, or the one pi gives it. */
export function useProviderLabel(): (provider: LlmProvider) => string {
	const pi = usePiProviders().data;
	return useCallback(
		(provider) =>
			isPiProvider(provider)
				? (pi?.find((p) => p.id === provider)?.name ?? provider.slice("pi:".length))
				: APP_PROVIDER_LABELS[provider],
		[pi],
	);
}

/** The providers a model can be chosen from: the app's own, and pi's others that are set up
 *  (and `current`, even when it no longer is). */
export function useProviderOptions(current?: LlmProvider | null) {
	const pi = usePiProviders().data;
	const label = useProviderLabel();
	return useMemo(() => {
		const others = (pi ?? []).filter((p) => p.configured || p.id === current).map((p) => p.id);
		if (current && isPiProvider(current) && !others.includes(current)) others.push(current);
		return [...APP_PROVIDERS, ...others].map((p) => ({ value: p as LlmProvider, label: label(p) }));
	}, [pi, current, label]);
}
