import { type DragEvent, useState } from "react";

export const DROP_HIGHLIGHT = "border-pastel-yellow-edge bg-selected";

/** Drag-over state plus the handlers and dashed-box style of a file drop target. */
export function useFileDrop(onDrop: (data: DataTransfer) => void, className = "") {
	const [dragging, setDragging] = useState(false);
	const props = {
		onDragOver: (e: DragEvent) => {
			e.preventDefault();
			setDragging(true);
		},
		onDragLeave: () => setDragging(false),
		onDrop: (e: DragEvent) => {
			e.preventDefault();
			setDragging(false);
			onDrop(e.dataTransfer);
		},
		className: `flex flex-col items-center rounded-xl border-2 border-dashed border-foreground/40 px-4 text-center transition-colors ${className} ${dragging ? DROP_HIGHLIGHT : "bg-muted"}`,
	};
	return [dragging, props] as const;
}
