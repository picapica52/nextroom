import type { Expression } from "@nextroom/contracts";
import { cn } from "@nextroom/ui/lib/utils";
import { UserRound } from "lucide-react";
import { useEffect } from "react";
import { expressionUrl } from "@/lib/api";

/** The face of the call screen. Fills its (positioned) parent. */
export function FaceStage({
	characterId,
	expressions,
	face,
	portrait,
	imageClassName,
}: {
	characterId: string | null;
	expressions: Expression[];
	/** The expression shown; null (or one that is gone): the portrait. */
	face: string | null;
	portrait: string | null;
	/** How the image sits in the stage, such as its crop. */
	imageClassName?: string;
}) {
	const shown = expressions.find((e) => e.id === face);
	const src = shown && characterId ? expressionUrl(characterId, shown) : portrait;

	useEffect(() => {
		for (const e of expressions) {
			if (characterId) new Image().src = expressionUrl(characterId, e);
		}
	}, [characterId, expressions]);

	return (
		<div className="absolute inset-0 overflow-hidden">
			{src ? (
				<img src={src} alt="" className={cn("size-full object-cover", imageClassName)} />
			) : (
				<div className="grid size-full place-items-center">
					<UserRound className="size-28 text-foreground/35" aria-hidden="true" />
				</div>
			)}
		</div>
	);
}
