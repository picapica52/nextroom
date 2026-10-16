import { useSyncExternalStore } from "react";

/** The microphone's loudness (0–1) while recording. It changes many times a second, so it is kept
 *  out of React state and only the meter that shows it re-renders. */
export class MicLevel {
	private value = 0;
	private listeners = new Set<() => void>();

	set = (level: number) => {
		if (level === this.value) return;
		this.value = level;
		for (const l of this.listeners) l();
	};

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	get = () => this.value;
}

export function useMicLevel(level: MicLevel) {
	return useSyncExternalStore(level.subscribe, level.get);
}
