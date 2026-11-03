import type { AgentStep, CharacterView } from "@nextroom/contracts";
import { Spinner } from "@nextroom/ui/components/spinner";
import { cn } from "@nextroom/ui/lib/utils";
import { Check, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { KINDS, shortStepLabel } from "@/features/agent/labels";
import { avatarUrl } from "@/lib/api";
import { type MicLevel, useMicLevel } from "../voice/mic-level";

/** Who is talking on the call: the character, the user (holding the microphone), or neither
 *  while the reply is prepared or nothing goes on. */
export type CallState = "speaking" | "listening" | "thinking" | "idle";

const STATE_LABEL: Record<CallState, string> = {
	speaking: "話しています",
	listening: "聞いています",
	thinking: "考えています",
	idle: "つながっています",
};

const RIPPLE_DELAYS = [0, 600, 1200];

/** The voice-call panel of a conversation: the name and the call's state at the top, the
 *  character's picture in a circle, and the captions under it. The circle sends out rings
 *  while the character speaks, and swells with the microphone while the user talks. */
export function CallStage({
	character,
	name,
	state,
	micLevel,
	steps,
	onLog,
	children,
}: {
	character: CharacterView | undefined;
	name: string;
	state: CallState;
	micLevel: MicLevel;
	/** The latest tool calls of the reply, oldest first. */
	steps: AgentStep[];
	onLog: () => void;
	/** The captions, shown under the face. */
	children?: ReactNode;
}) {
	const portrait = character ? avatarUrl(character) : null;
	return (
		<div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-[26px] border-2 bg-pastel-lilac shadow-puff-lg [container-type:size]">
			<div className="flex shrink-0 items-start justify-between gap-3 px-4.5 pt-4">
				<div className="flex min-w-0 flex-col gap-0.5">
					<span className="truncate text-[19px] font-extrabold tracking-[0.01em]">{name}</span>
					<span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground">
						<span className="size-2 rounded-full bg-success" aria-hidden="true" />
						音声通話中 · {STATE_LABEL[state]}
					</span>
				</div>
				{steps.length > 0 && (
					<div className="flex min-w-0 flex-col items-end gap-1.5">
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

			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 py-2">
				<div className="relative aspect-square w-[min(62cqw,40cqh)] shrink-0">
					{state === "speaking" &&
						RIPPLE_DELAYS.map((delay) => (
							<span
								key={delay}
								className="absolute inset-0 animate-ripple rounded-full border-3 border-white"
								style={{ animationDelay: `${delay}ms` }}
								aria-hidden="true"
							/>
						))}
					{state === "listening" && <ListeningRing level={micLevel} />}
					<div className="absolute inset-0 overflow-hidden rounded-full border-4 border-white bg-white shadow-[0_4px_0_0_rgb(43_37_64/0.18)]">
						{portrait ? (
							<img
								src={portrait}
								alt=""
								className="size-full origin-[50%_22%] scale-135 object-cover object-[50%_18%]"
							/>
						) : (
							<div className="grid size-full place-items-center">
								<UserRound className="size-28 text-foreground/35" aria-hidden="true" />
							</div>
						)}
					</div>
				</div>
			</div>

			<div
				className="flex max-h-[45cqh] shrink-0 flex-col items-center justify-end gap-1.5 overflow-y-auto px-3.5 pb-3.5"
				aria-live="polite"
			>
				{children}
			</div>
		</div>
	);
}

/** Swells with the microphone's loudness; the only part that re-renders with it. */
function ListeningRing({ level }: { level: MicLevel }) {
	const value = Math.min(useMicLevel(level) * 1.6, 1);
	return (
		<span
			className="absolute inset-0 rounded-full bg-primary/30 transition-transform duration-75"
			style={{ transform: `scale(${1.04 + value * 0.26})` }}
			aria-hidden="true"
		/>
	);
}
