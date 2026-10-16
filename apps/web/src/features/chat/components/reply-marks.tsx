import { cn } from "@nextroom/ui/lib/utils";

export function ThinkingDots() {
	return (
		<span role="img" className="flex h-[1.625em] items-center gap-1" aria-label="考えています">
			{[0, 150, 300].map((delay) => (
				<span
					key={delay}
					className="size-1.5 animate-hop rounded-full bg-pastel-lilac-shadow"
					style={{ animationDelay: `${delay}ms` }}
				/>
			))}
		</span>
	);
}

export function Caret({ narration }: { narration: boolean }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"ml-0.5 inline-block h-[1.05em] w-0.5 animate-blink rounded-full align-[-0.15em]",
				narration ? "bg-muted-foreground" : "bg-primary",
			)}
		/>
	);
}

/** Small sound bars on the bubble being read aloud. */
export function SpeakingBadge() {
	return (
		<span
			role="img"
			aria-label="読み上げ中"
			className="absolute -top-2.5 right-2.5 flex h-4 animate-pop items-center gap-0.5 rounded-full border-2 border-pastel-lilac-edge bg-card px-1.5"
		>
			{[0, 200, 400].map((delay) => (
				<span
					key={delay}
					className="h-1.5 w-0.5 animate-eq rounded-full bg-primary"
					style={{ animationDelay: `${delay}ms` }}
				/>
			))}
		</span>
	);
}
