import {
	type MouseEvent,
	type PointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { MicRecorder, prepareRecorder } from "@/lib/recorder";

/** opening: pressed, waiting for the microphone; holding: recording until released. */
type PushToTalkState = "idle" | "opening" | "holding";

interface Options {
	disabled?: boolean;
	/** Pressed: stop what is playing before the microphone opens. */
	onPress?: () => void;
	/** Released after saying something: the recording as a 16 kHz WAV. */
	onRecorded: (wav: Blob) => void;
	onLevel?: (level: number) => void;
	onError?: (error: unknown) => void;
}

// A shorter press is taken for a slip and nothing is sent.
const MIN_SECONDS = 0.3;

/** Space belongs to text fields, buttons and dialogs; the push-to-talk button itself is marked data-ptt. */
const usesSpace = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	!target.closest("[data-ptt]") &&
	!!target.closest(
		"input, textarea, select, button, a, [contenteditable=''], [contenteditable='true'], [role='button'], [role='radio'], [role='switch'], [role='menuitem'], [role='dialog']",
	);

/** Records while the button (or Space) is held down, and hands the recording over when it is let go. */
export function usePushToTalk(options: Options) {
	const [state, setState] = useState<PushToTalkState>("idle");
	const latest = useRef(options);
	latest.current = options;
	const recorder = useRef<MicRecorder | null>(null);
	const held = useRef(false);
	const open = useRef(false);

	const finish = useCallback(() => {
		const rec = recorder.current;
		if (!rec) return;
		recorder.current = null;
		open.current = false;
		setState("idle");
		const long = rec.seconds >= MIN_SECONDS;
		const wav = rec.stop();
		if (long) latest.current.onRecorded(wav);
	}, []);

	const release = useCallback(() => {
		if (!held.current) return;
		held.current = false;
		// Let go before the microphone opened: press() finishes once it has.
		if (open.current) finish();
	}, [finish]);

	const press = useCallback(async () => {
		if (held.current || recorder.current || latest.current.disabled) return;
		held.current = true;
		latest.current.onPress?.();
		const rec = new MicRecorder((l) => latest.current.onLevel?.(l));
		recorder.current = rec;
		setState("opening");
		try {
			await rec.start();
		} catch (e) {
			rec.close();
			recorder.current = null;
			held.current = false;
			setState("idle");
			latest.current.onError?.(e);
			return;
		}
		if (recorder.current !== rec) {
			rec.close();
			return;
		}
		open.current = true;
		if (held.current) setState("holding");
		else finish();
	}, [finish]);

	/** Drop the recording without sending it. */
	const cancel = useCallback(() => {
		held.current = false;
		open.current = false;
		recorder.current?.close();
		recorder.current = null;
		setState("idle");
	}, []);

	useEffect(() => cancel, [cancel]);

	useEffect(() => {
		prepareRecorder().catch(() => {});
	}, []);

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.code !== "Space" || e.repeat || usesSpace(e.target)) return;
			e.preventDefault();
			void press();
		};
		const up = (e: KeyboardEvent) => {
			if (e.code !== "Space" || !held.current) return;
			e.preventDefault();
			release();
		};
		window.addEventListener("keydown", down);
		window.addEventListener("keyup", up);
		window.addEventListener("blur", release);
		return () => {
			window.removeEventListener("keydown", down);
			window.removeEventListener("keyup", up);
			window.removeEventListener("blur", release);
		};
	}, [press, release]);

	const buttonProps = {
		"data-ptt": "",
		onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
			if (e.button !== 0) return;
			e.preventDefault();
			// Listen on the window: the pointer may leave the button, or the button may become disabled.
			const up = () => {
				window.removeEventListener("pointerup", up);
				window.removeEventListener("pointercancel", up);
				release();
			};
			window.addEventListener("pointerup", up);
			window.addEventListener("pointercancel", up);
			void press();
		},
		onContextMenu: (e: MouseEvent) => e.preventDefault(),
	};

	return { state, cancel, buttonProps };
}
