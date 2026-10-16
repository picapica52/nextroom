import { useEffect, useState } from "react";
import type { z } from "zod";

/** A state kept in localStorage under `key`, so it survives reloads. A stored value `schema` rejects
 *  (or one that is not JSON) gives `initial`. */
export function useLocalState<T>(key: string, initial: T, schema?: z.ZodType<T>) {
	const [value, setValue] = useState<T>(() => {
		try {
			const raw = localStorage.getItem(key);
			if (raw === null) return initial;
			const parsed: unknown = JSON.parse(raw);
			if (!schema) return parsed as T;
			const result = schema.safeParse(parsed);
			return result.success ? result.data : initial;
		} catch {
			return initial;
		}
	});
	useEffect(() => {
		try {
			localStorage.setItem(key, JSON.stringify(value));
		} catch {
			/* storage unavailable */
		}
	}, [key, value]);
	return [value, setValue] as const;
}
