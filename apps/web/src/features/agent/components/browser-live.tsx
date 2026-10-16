import type { BrowserInput, BrowserView } from "@nextroom/contracts";
import { useMutation } from "@tanstack/react-query";
import { type MouseEvent, useEffect, useRef, type WheelEvent } from "react";
import { ErrorNote } from "@/components/status";
import { sendBrowserInput } from "../browser";

/** The conversation's page as the agent sees it; with `interactive`, clicks and the wheel go to it. */
export function BrowserLive({
	sessionId,
	view,
	interactive = false,
}: {
	sessionId: string;
	view: BrowserView | undefined;
	interactive?: boolean;
}) {
	const img = useRef<HTMLImageElement>(null);
	const input = useMutation({
		mutationFn: (i: BrowserInput) => sendBrowserInput(sessionId, i),
	});
	// The wheel fires many events a second: they are added up and sent once per frame.
	const wheel = useRef<{ x: number; y: number; delta: number; frame: number } | null>(null);
	useEffect(() => () => cancelAnimationFrame(wheel.current?.frame ?? 0), []);
	// Where on the page (in its CSS pixels) a point of the image is.
	const pagePoint = (e: MouseEvent | WheelEvent) => {
		const box = img.current?.getBoundingClientRect();
		if (!box || !view) return null;
		return {
			x: Math.round(((e.clientX - box.left) / box.width) * view.width),
			y: Math.round(((e.clientY - box.top) / box.height) * view.height),
		};
	};
	if (!view?.frame_at) {
		return (
			<div className="flex aspect-video items-center justify-center rounded-lg border-2 border-dashed border-foreground/40 bg-muted px-4 text-center text-xs text-muted-foreground">
				{view?.active ? "画面を読み込んでいます…" : "この会話ではまだブラウザを開いていません"}
			</div>
		);
	}
	const image = (
		<img
			ref={img}
			src={`/api/browser/${sessionId}/frame?t=${view.frame_at}`}
			alt={view.url ? `ブラウザの画面: ${view.url}` : "ブラウザの画面"}
			className="block h-auto w-full select-none"
			draggable={false}
		/>
	);
	if (!interactive) {
		return <div className="overflow-hidden rounded-lg border">{image}</div>;
	}
	return (
		<>
			<button
				type="button"
				aria-label="ブラウザの画面（クリックで操作）"
				className="block w-full cursor-pointer overflow-hidden rounded-lg border p-0"
				onClick={(e) => {
					const at = pagePoint(e);
					if (at) input.mutate({ type: "click", ...at });
				}}
				onWheel={(e) => {
					const at = pagePoint(e);
					if (!at) return;
					if (wheel.current) {
						wheel.current = { ...wheel.current, ...at, delta: wheel.current.delta + e.deltaY };
						return;
					}
					const frame = requestAnimationFrame(() => {
						const w = wheel.current;
						wheel.current = null;
						if (w) input.mutate({ type: "scroll", x: w.x, y: w.y, delta_y: w.delta });
					});
					wheel.current = { ...at, delta: e.deltaY, frame };
				}}
			>
				{image}
			</button>
			<ErrorNote error={input.error} />
		</>
	);
}
