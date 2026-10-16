import type { AgentStep } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { cn } from "@nextroom/ui/lib/utils";
import { Check, MessageCircleQuestionMark } from "lucide-react";
import { useState } from "react";

/** The choices a reply ended with (ask_user) for the user to decide: the one picked is sent as
 *  the user's next message. Any number may be picked when the reply allows it. */
export function ChoiceCard({
	step,
	disabled,
	onChoose,
}: {
	step: AgentStep;
	disabled: boolean;
	onChoose: (text: string) => void;
}) {
	const [chosen, setChosen] = useState<string[]>([]);
	const question = step.question;
	if (!question?.options.length) return null;
	const multi = question.multi;
	const toggle = (label: string) =>
		setChosen((old) => (old.includes(label) ? old.filter((l) => l !== label) : [...old, label]));

	return (
		<div className="flex animate-rise flex-col gap-2.5 rounded-xl border-2 border-pastel-lilac-edge bg-pastel-lilac/35 p-3 shadow-puff">
			<span className="flex items-center gap-1.5 text-[13px] font-bold">
				<MessageCircleQuestionMark className="size-4 shrink-0 text-mode-si" aria-hidden="true" />
				{question.text}
			</span>
			<div className="flex flex-col gap-1.5">
				{question.options.map((option) => {
					const on = chosen.includes(option.label);
					return (
						<button
							key={option.label}
							type="button"
							aria-pressed={multi ? on : undefined}
							disabled={disabled}
							onClick={() => (multi ? toggle(option.label) : onChoose(option.label))}
							className={cn(
								"flex items-start gap-2.5 rounded-xl border-2 bg-background px-3 py-2 text-left shadow-puff-sm transition-colors duration-120 ease-smooth hover:border-border-strong disabled:opacity-60",
								on && "border-pastel-yellow-edge bg-selected hover:border-pastel-yellow-edge",
							)}
						>
							{multi && (
								<span
									className={cn(
										"mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[5px] border-2 border-border-strong",
										on && "border-pastel-yellow-edge bg-pastel-yellow",
									)}
								>
									{on && <Check className="size-3" aria-hidden="true" />}
								</span>
							)}
							<span className="flex min-w-0 flex-col gap-0.5">
								<span className="text-sm font-medium">{option.label}</span>
								{option.description && (
									<span className="text-xs text-muted-foreground">{option.description}</span>
								)}
							</span>
						</button>
					);
				})}
			</div>
			{multi && (
				<Button
					size="sm"
					className="self-end"
					disabled={disabled || !chosen.length}
					onClick={() => onChoose(chosen.join("、"))}
				>
					これで答える
				</Button>
			)}
		</div>
	);
}
