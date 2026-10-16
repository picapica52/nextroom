import type { KeyboardEvent } from "react";

/** Enter without Shift (which adds a line), and not the Enter that confirms IME conversion:
 *  Safari fires that one after composition ends, flagged only by keyCode 229. */
export const isSubmitEnter = (e: KeyboardEvent) =>
	e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229;
