import { Spinner } from "@nextroom/ui/components/spinner";
import { cn } from "@nextroom/ui/lib/utils";
import { Mic, Square } from "lucide-react";
import type { ComponentProps } from "react";
import { type MicLevel, useMicLevel } from "./mic-level";

/** What the microphone shows: ready to be held, opening, recording, or busy with the reply. */
export type MicMode = "idle" | "opening" | "holding" | "replying";

/** The push-to-talk microphone: mint while ready, red and swelling while held, a stop button while
 *  the reply is prepared. */
export function MicButton({
	mode,
	level,
	className,
	...props
}: ComponentProps<"button"> & { mode: MicMode; level: MicLevel }) {
	const holding = mode === "holding";
	return (
		<div className="relative flex size-17 shrink-0 items-center justify-center">
			{holding && (
				<>
					<LevelRing level={level} />
					<span
						className="absolute inset-0 animate-halo rounded-full bg-destructive/35"
						aria-hidden="true"
					/>
				</>
			)}
			<button
				type="button"
				aria-pressed={holding}
				className={cn(
					"relative flex size-15 items-center justify-center rounded-full border-2 border-border transition-[translate,box-shadow,background-color,color] duration-120 ease-smooth outline-none select-none touch-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-[3px] active:shadow-none disabled:border-dashed disabled:border-border-strong disabled:bg-muted disabled:text-foreground/45 disabled:shadow-none [&_svg]:size-6.5",
					mode === "holding" && "size-16 border-destructive bg-destructive text-white",
					mode === "idle" &&
						"border-pastel-mint-edge bg-pastel-mint text-foreground shadow-[0_3px_0_0_var(--pastel-mint-shadow)] hover:bg-[color-mix(in_oklch,var(--pastel-mint),var(--foreground)_7%)]",
					mode === "replying" &&
						"border-dashed border-muted-foreground bg-muted text-muted-foreground hover:bg-pressed [&_svg]:size-5.5",
					mode === "opening" && "bg-background text-foreground shadow-puff",
					className,
				)}
				{...props}
			>
				{mode === "opening" ? (
					<Spinner />
				) : mode === "replying" ? (
					<Square className="fill-current" />
				) : (
					<Mic />
				)}
			</button>
		</div>
	);
}

/** Swells with the voice while recording; the only part that follows the level. */
function LevelRing({ level }: { level: MicLevel }) {
	const value = useMicLevel(level);
	return (
		<span
			className="absolute inset-0 rounded-full bg-destructive/20 transition-transform duration-75"
			style={{ transform: `scale(${1 + Math.min(value, 1) * 0.35})` }}
			aria-hidden="true"
		/>
	);
}
