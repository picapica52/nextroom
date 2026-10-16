import {
	type CharacterView,
	type Expression,
	type ExpressionTag,
	type ExpressionTagGuess,
	expressionTagLabel,
} from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@nextroom/ui/components/popover";
import { Spinner } from "@nextroom/ui/components/spinner";
import { cn } from "@nextroom/ui/lib/utils";
import { ChevronsUpDown, RefreshCw, Sparkles, Star, Undo2, WandSparkles, X } from "lucide-react";
import { useState } from "react";
import { useConfirm } from "@/components/confirm";
import { ErrorNote } from "@/components/status";
import { expressionUrl } from "@/lib/api";
import { expressionStyleBadge } from "../expression-styles";
import { type Tagged, useExpressionCardActions } from "../expressions";
import { ExpressionTagList } from "./expression-tag-list";

export function ExpressionCard({
	character,
	expression,
	onChange,
	processing,
	judging,
	guess,
	onTagged,
	locked,
}: {
	character: CharacterView;
	expression: Expression;
	onChange: (c: CharacterView) => void;
	/** Being cut out by "まとめて背景を透過". */
	processing: boolean;
	/** Being tagged by "タグを自動で付ける". */
	judging: boolean;
	/** The Decisions API's last choice for this face. */
	guess: ExpressionTagGuess | undefined;
	onTagged: (result: Tagged) => void;
	/** A batch is running, so this card waits its turn. */
	locked: boolean;
}) {
	const confirm = useConfirm();
	const { update, remove, cutout, restore, tag, regenerate, makeNeutral } =
		useExpressionCardActions(character.id, expression.id, onChange, onTagged);
	const drawing = regenerate.isPending;
	const busy = cutout.isPending || processing;
	const guessing = tag.isPending || judging;
	const neutral = character.neutral === expression.id;

	return (
		<div
			className={cn(
				"flex flex-col overflow-hidden rounded-xl border-2 bg-card",
				neutral && "border-primary ring-3 ring-pastel-lilac",
			)}
		>
			<div className="bg-checker relative aspect-square border-b-2">
				<img
					src={expressionUrl(character.id, expression)}
					alt={expressionTagLabel(expression.tag)}
					className={cn("size-full object-cover", (busy || guessing || drawing) && "opacity-45")}
				/>
				{(busy || guessing || drawing) && (
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/55">
						<Spinner className="size-7" />
						<span className="rounded-full border-2 bg-background px-2.5 text-xs font-extrabold">
							{busy ? "透過処理中…" : drawing ? "生成中…" : "判定中…"}
						</span>
					</div>
				)}
				{neutral ? (
					<span className="absolute top-1.5 left-1.5 inline-flex h-6 items-center gap-1 rounded-full border-2 border-primary bg-primary px-2 text-[11px] font-extrabold text-primary-foreground">
						<Star className="size-3" />
						Neutral・アイコン
					</span>
				) : (
					expression.generated && (
						<span className="absolute top-1.5 left-1.5 inline-flex h-6 items-center rounded-full border-2 bg-pastel-lilac px-2 text-[11px] font-extrabold">
							{expressionStyleBadge(expression.generated.style)}
						</span>
					)
				)}
				{expression.cutout && (
					<span className="absolute bottom-1.5 left-1.5 inline-flex h-6 items-center rounded-full border-2 bg-pastel-mint px-2 text-[11px] font-extrabold">
						透過済み
					</span>
				)}
				<Button
					variant="outline"
					size="icon-xs"
					className="absolute top-1.5 right-1.5 rounded-full"
					aria-label="この表情を削除"
					title="この表情を削除"
					disabled={remove.isPending || busy || guessing || drawing || locked}
					onClick={async () => {
						const ok = await confirm({
							title: "この表情を削除しますか？",
							action: "削除",
							destructive: true,
						});
						if (ok) remove.mutate();
					}}
				>
					<X />
				</Button>
			</div>
			<div className="flex flex-col gap-1.5 p-2">
				{neutral ? (
					<div className="flex h-8 items-center rounded-lg border-2 border-pastel-lilac-edge bg-pastel-lilac px-2.5 text-sm font-bold">
						Neutral
						<span className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">
							neutral
						</span>
					</div>
				) : (
					<TagPicker
						value={expression.tag}
						used={new Set(character.expressions.filter((e) => e !== expression).map((e) => e.tag))}
						disabled={update.isPending || guessing || drawing}
						onSelect={(tag) => {
							if (tag !== expression.tag) update.mutate({ tag });
						}}
					/>
				)}
				{guess?.tag === expression.tag && <GuessNote guess={guess} />}
				<div className="flex flex-wrap gap-1.5">
					<Button
						variant="outline"
						size="xs"
						disabled={guessing || drawing || locked || neutral}
						onClick={() => tag.mutate()}
					>
						{guessing ? <Spinner /> : <Sparkles />}
						{guessing ? "判定中" : expression.tag ? "判定し直す" : "タグを判定"}
					</Button>
					{expression.cutout ? (
						<Button
							variant="outline"
							size="xs"
							disabled={restore.isPending || locked}
							onClick={() => restore.mutate()}
						>
							<Undo2 />
							元に戻す
						</Button>
					) : (
						<Button
							variant="outline"
							size="xs"
							disabled={busy || drawing || locked}
							onClick={() => cutout.mutate()}
						>
							{busy ? <Spinner /> : <WandSparkles />}
							{busy ? "処理中" : "背景を透過"}
						</Button>
					)}
					{expression.generated && (
						<Button
							variant="outline"
							size="xs"
							title="同じ参照画像と指示で、いまのタグの表情を描き直します"
							disabled={drawing || busy || guessing || locked || (!expression.tag && !neutral)}
							onClick={() => regenerate.mutate()}
						>
							{drawing ? <Spinner /> : <RefreshCw />}
							{drawing ? "生成中" : "作り直す"}
						</Button>
					)}
					{!neutral && (
						<Button
							variant="outline"
							size="xs"
							title="この画像を Neutral（アイコン）にします。タグは外れます"
							disabled={makeNeutral.isPending || busy || drawing}
							onClick={() => makeNeutral.mutate()}
						>
							{makeNeutral.isPending ? <Spinner /> : <Star />}
							Neutral にする
						</Button>
					)}
				</div>
				<ErrorNote
					error={
						update.error ??
						remove.error ??
						cutout.error ??
						restore.error ??
						tag.error ??
						regenerate.error ??
						makeNeutral.error
					}
				/>
			</div>
		</div>
	);
}

/** How sure the Decisions API was, with the tag it nearly chose. */
function GuessNote({ guess }: { guess: ExpressionTagGuess }) {
	const percent = (p: number) => `${Math.round(p * 100)}%`;
	return (
		<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1.5 gap-y-0.5 rounded-lg bg-canvas px-2 py-1.5 text-[11px] text-muted-foreground">
			<span className="row-span-2 inline-flex h-5 items-center self-start rounded-full border-2 bg-pastel-mint px-1.5 text-[10px] font-extrabold text-foreground">
				AI
			</span>
			<span className="truncate">{expressionTagLabel(guess.tag)}</span>
			<span className="text-right font-mono tabular-nums">{percent(guess.probability)}</span>
			{guess.runner_up && (
				<>
					<span className="truncate">次点 {expressionTagLabel(guess.runner_up.tag)}</span>
					<span className="text-right font-mono tabular-nums">
						{percent(guess.runner_up.probability)}
					</span>
				</>
			)}
		</div>
	);
}

/** The face's tag, picked from the fixed tags. */
function TagPicker({
	value,
	used,
	disabled,
	onSelect,
}: {
	value: string;
	/** Tags on the character's other faces. */
	used: Set<string>;
	disabled: boolean;
	onSelect: (tag: ExpressionTag) => void;
}) {
	const [open, setOpen] = useState(false);
	const label = expressionTagLabel(value);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				disabled={disabled}
				render={
					<Button
						variant="outline"
						size="sm"
						aria-label="タグ"
						className="w-full justify-between gap-1.5 px-2.5"
					/>
				}
			>
				{label ? (
					<span className="truncate">{label}</span>
				) : (
					<span className="font-normal text-muted-foreground">タグを選ぶ</span>
				)}
				<ChevronsUpDown className="size-4! shrink-0 text-muted-foreground" />
			</PopoverTrigger>
			<PopoverContent align="start" className="w-[min(320px,calc(100vw-32px))] p-0">
				<ExpressionTagList
					checked={(tag) => tag === value}
					used={used}
					onSelect={(tag) => {
						setOpen(false);
						onSelect(tag);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}
