import { type AgentStep, type CharacterView, expressionTagLabel } from "@nextroom/contracts";
import { Spinner } from "@nextroom/ui/components/spinner";
import { cn } from "@nextroom/ui/lib/utils";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { KINDS, shortStepLabel } from "@/features/agent/labels";
import { FaceStage } from "@/features/characters/components/face-stage";
import { moodColor } from "@/features/characters/face-mood";
import { avatarUrl } from "@/lib/api";

/** The face panel of a conversation: the face on the color of its mood, the captions above it, the face's
 *  tag and the tools the reply used. Taller than wide; the face sits at the bottom, so when there
 *  is less room the captions come over its top. */
export function CallStage({
	characterId,
	character,
	face,
	speaking,
	steps,
	onLog,
	children,
}: {
	characterId: string | null;
	character: CharacterView | undefined;
	face: string | null;
	/** The reply is being spoken (or is about to be). */
	speaking: boolean;
	/** The latest tool calls of the reply, oldest first. */
	steps: AgentStep[];
	onLog: () => void;
	/** The captions, shown above the face. */
	children?: ReactNode;
}) {
	const expressions = character?.expressions ?? [];
	const portrait = character ? avatarUrl(character) : null;
	const shown = expressions.find((e) => e.id === face);
	const faceLabel = shown ? expressionTagLabel(shown.tag) : null;
	return (
		<div
			className={cn(
				"relative min-h-0 w-full flex-1 overflow-hidden rounded-[26px] border-2 bg-pastel-lilac shadow-puff-lg transition-[background-color,box-shadow] duration-500 ease-smooth [container-type:size]",
				speaking && "ring-4 ring-primary/30",
			)}
			style={{ backgroundColor: moodColor(shown) }}
		>
			<div className="absolute bottom-0 left-1/2 aspect-square w-[min(100cqw,88cqh)] -translate-x-1/2">
				<FaceStage
					characterId={characterId}
					expressions={expressions}
					face={face}
					portrait={portrait}
				/>
			</div>
			<div
				className="absolute inset-x-0 top-0 flex max-h-full flex-col items-center gap-1.5 overflow-y-auto px-3.5 pt-3.5 pb-3"
				aria-live="polite"
			>
				{children}
			</div>
			{faceLabel && (
				<span
					key={faceLabel}
					className="absolute bottom-3 left-3 inline-flex h-6.5 max-w-32 animate-pop items-center truncate rounded-full border-2 border-pastel-yellow-edge bg-selected px-2.5 text-[11.5px] font-extrabold"
				>
					{faceLabel}
				</span>
			)}
			{steps.length > 0 && (
				<div className="absolute right-3 bottom-3 left-28 flex flex-col items-end gap-1.5">
					{steps.map((step) => {
						const kind = KINDS[step.kind];
						const done = step.status === "done";
						return (
							<button
								key={step.id}
								type="button"
								onClick={onLog}
								className={cn(
									"inline-flex h-6.5 max-w-full animate-rise items-center gap-1.5 rounded-full border-2 bg-background px-2.5 text-[11px] font-bold shadow-puff-sm transition-colors duration-120 ease-smooth hover:bg-muted",
									done && "text-muted-foreground",
								)}
							>
								{step.status === "running" ? (
									<Spinner className="size-3.5" />
								) : done ? (
									<Check className="size-3.5 text-success" />
								) : (
									<kind.icon className={cn("size-3.5", kind.tone)} />
								)}
								<span className="truncate">
									{kind.title}: {shortStepLabel(step)}
								</span>
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
