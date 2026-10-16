import {
	EXPRESSION_TAG_GROUPS,
	EXPRESSION_TAG_VALUES,
	type ExpressionTag,
} from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { cn } from "@nextroom/ui/lib/utils";
import { Check, Minus } from "lucide-react";

const QUICK_BUTTON = "h-7 rounded-full px-3 text-xs";

/** The tags to draw: chosen one by one, by group, or all the ones without a face yet. */
export function ExpressionTagPicker({
	tags,
	used,
	onChange,
}: {
	tags: ExpressionTag[];
	used: Set<string>;
	onChange: (tags: ExpressionTag[]) => void;
}) {
	const chosen = new Set<string>(tags);
	const missing = EXPRESSION_TAG_VALUES.filter((t) => !used.has(t));
	// Kept in the list's order, so the faces are drawn group by group.
	const set = (next: Set<string>) => onChange(EXPRESSION_TAG_VALUES.filter((t) => next.has(t)));
	const toggle = (values: string[], on: boolean) => {
		const next = new Set(chosen);
		for (const v of values) on ? next.add(v) : next.delete(v);
		set(next);
	};

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-sm font-bold">作る表情のタグ</span>
				<span className="ml-auto text-xs font-extrabold tabular-nums">
					{tags.length} / {EXPRESSION_TAG_VALUES.length} 選択中
				</span>
			</div>
			<div className="flex flex-wrap gap-1.5">
				<Button
					variant="outline"
					size="sm"
					className={QUICK_BUTTON}
					disabled={missing.length === 0}
					onClick={() => set(new Set(missing))}
				>
					まだ無い表情（{missing.length}）
				</Button>
				<Button
					variant="outline"
					size="sm"
					className={QUICK_BUTTON}
					onClick={() => set(new Set(EXPRESSION_TAG_VALUES))}
				>
					すべて（{EXPRESSION_TAG_VALUES.length}）
				</Button>
				<Button
					variant="outline"
					size="sm"
					className={QUICK_BUTTON}
					disabled={tags.length === 0}
					onClick={() => set(new Set())}
				>
					選択を外す
				</Button>
			</div>
			<div className="flex max-h-72 flex-col gap-2.5 overflow-y-auto rounded-lg border-2 px-3 pt-1.5 pb-3">
				{EXPRESSION_TAG_GROUPS.map((group) => {
					const values = group.tags.map((t) => t.value);
					const count = values.filter((v) => chosen.has(v)).length;
					const all = count === values.length;
					return (
						<div key={group.label} className="flex flex-col gap-1.5">
							<button
								type="button"
								aria-pressed={all}
								onClick={() => toggle(values, !all)}
								className="flex items-center gap-2 rounded-md py-1 text-left text-xs font-extrabold text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
							>
								<span
									className={cn(
										"flex size-4 items-center justify-center rounded-[4px] border-2 border-border-strong bg-background text-foreground",
										all && "border-pastel-yellow-edge bg-pastel-yellow",
										count > 0 && !all && "border-pastel-yellow-edge bg-selected",
									)}
								>
									{all ? <Check className="size-3" /> : count > 0 && <Minus className="size-3" />}
								</span>
								{group.label}
								<span className="font-bold tabular-nums">
									{count}/{values.length}
								</span>
							</button>
							<div className="flex flex-wrap gap-1.5">
								{group.tags.map((tag) => (
									<button
										key={tag.value}
										type="button"
										title={tag.value}
										aria-pressed={chosen.has(tag.value)}
										onClick={() => toggle([tag.value], !chosen.has(tag.value))}
										className={cn(
											"inline-flex h-7 items-center gap-1.5 rounded-full border-2 bg-background px-2.5 text-xs font-bold transition-colors duration-120 ease-smooth hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
											chosen.has(tag.value) &&
												"border-pastel-yellow-edge bg-selected hover:bg-selected",
										)}
									>
										{tag.label}
										{used.has(tag.value) && (
											<span className="inline-flex h-4 items-center rounded-full border-[1.5px] border-foreground/15 bg-pastel-mint px-1.5 text-[10px] font-extrabold">
												あり
											</span>
										)}
									</button>
								))}
							</div>
						</div>
					);
				})}
			</div>
			<span className="text-xs text-muted-foreground">
				グループ名を押すと、そのグループをまとめて選択・解除します。「あり」はもう画像があるタグです。
			</span>
		</div>
	);
}
