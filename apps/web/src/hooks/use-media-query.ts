import { useSyncExternalStore } from "react";

const LG = "(min-width: 1024px)";

/** Whether the window is at least Tailwind's `lg` wide. */
export function useWide() {
	return useSyncExternalStore(
		(cb) => {
			const mq = window.matchMedia(LG);
			mq.addEventListener("change", cb);
			return () => mq.removeEventListener("change", cb);
		},
		() => window.matchMedia(LG).matches,
	);
}
