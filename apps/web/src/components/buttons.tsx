import { Button, buttonVariants } from "@nextroom/ui/components/button";
import { cn } from "@nextroom/ui/lib/utils";
import { Pause, Play } from "lucide-react";
import type { ComponentProps } from "react";

type ButtonLook = Pick<ComponentProps<typeof Button>, "variant" | "size">;

/** A plain anchor styled as a button, e.g. a file download. */
export function AnchorButton({
	variant = "outline",
	size,
	className,
	...props
}: ComponentProps<"a"> & ButtonLook) {
	return (
		<a data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />
	);
}

/** Plays or stops a clip. */
export function PlayButton({ playing, onClick }: { playing: boolean; onClick: () => void }) {
	const label = playing ? "停止" : "再生";
	return (
		<Button variant="outline" size="icon-sm" aria-label={label} title={label} onClick={onClick}>
			{playing ? <Pause /> : <Play />}
		</Button>
	);
}
