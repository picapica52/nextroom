import { useRef, useState } from "react";

/** A set of checked ids; Shift+click sets every id from the last clicked one to the clicked one. */
export function useRangeSelection() {
	const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set());
	const anchor = useRef<string | null>(null);
	/** `ids` are the rows in their shown order. */
	const toggle = (ids: string[], id: string, on: boolean, shift: boolean) => {
		const from = shift && anchor.current ? ids.indexOf(anchor.current) : -1;
		const to = ids.indexOf(id);
		const range = from < 0 ? [id] : ids.slice(Math.min(from, to), Math.max(from, to) + 1);
		anchor.current = id;
		setChecked((prev) => {
			const next = new Set(prev);
			for (const r of range) {
				if (on) next.add(r);
				else next.delete(r);
			}
			return next;
		});
	};
	return { checked, setChecked, toggle };
}
