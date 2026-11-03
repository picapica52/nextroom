import { type LlmProvider, OPENAI_COMPATIBLE } from "@nextroom/contracts";
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
