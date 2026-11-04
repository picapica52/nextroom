import { useSyncExternalStore } from "react";

function useMediaQuery(query: string) {
	return useSyncExternalStore(
		(cb) => {
			const mq = window.matchMedia(query);
			mq.addEventListener("change", cb);
			return () => mq.removeEventListener("change", cb);
		},
		() => window.matchMedia(query).matches,
	);
}

/** Whether the window is at least Tailwind's `md` wide. */
export const useMedium = () => useMediaQuery("(min-width: 768px)");

/** Whether the window is at least Tailwind's `lg` wide. */
export const useWide = () => useMediaQuery("(min-width: 1024px)");

/** Whether the window is at least Tailwind's `xl` wide. */
export const useExtraWide = () => useMediaQuery("(min-width: 1280px)");
