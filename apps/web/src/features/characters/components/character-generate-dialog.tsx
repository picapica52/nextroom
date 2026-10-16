import {
	NEW_CHARACTER_NAME,
	PERSONA_FIELDS,
	type Persona,
	type PersonaGeneratedField,
} from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Checkbox } from "@nextroom/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@nextroom/ui/components/dialog";
import { Label } from "@nextroom/ui/components/label";
import { Textarea } from "@nextroom/ui/components/textarea";
import { cn } from "@nextroom/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import { Dot, ErrorNote, Meter } from "@/components/status";
import { client, read } from "@/lib/api";
import { FIELD_LABELS } from "../persona-labels";

/** Writes `field` with the LLM from the user's note and the other fields; the text goes to `onApply`. */
export function CharacterGenerateDialog({
	characterId,
	persona,
	field,
	onClose,
	onApply,
}: {
	characterId: string;
	persona: Persona;
	field: PersonaGeneratedField | null;
	onClose: () => void;
	onApply: (changes: Partial<Persona>) => void;
}) {
	return (
		<Dialog open={field !== null} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="gap-4 sm:max-w-xl">
				{field && (
					<GenerateForm
						key={field}
						characterId={characterId}
						persona={persona}
						field={field}
						onCancel={onClose}
						onApply={(value) => {
							onApply({ [field]: value });
							onClose();
						}}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

/** The other fields with something written, the starting name aside. */
const filledOthers = (persona: Persona, field: PersonaGeneratedField) =>
	PERSONA_FIELDS.filter(
		(key) =>
			key !== field &&
			persona[key].trim() &&
			!(key === "name" && persona.name === NEW_CHARACTER_NAME),
	);

/** Mounted with the dialog, so each opening starts afresh. */
function GenerateForm({
	characterId,
	persona,
	field,
	onCancel,
	onApply,
}: {
	characterId: string;
	persona: Persona;
	field: PersonaGeneratedField;
	onCancel: () => void;
	onApply: (value: string) => void;
}) {
	const label = FIELD_LABELS[field];
	const others = filledOthers(persona, field);
	const current = persona[field].trim();
	const [note, setNote] = useState("");
	const [chosen, setChosen] = useState<Set<keyof Persona>>(() => new Set(others));
	const [result, setResult] = useState<string | null>(null);

	const generate = useMutation({
		mutationFn: () =>
			read(
				client.characters[":id"].generate.$post({
					param: { id: characterId },
					json: {
						field,
						note,
						persona,
						reference: [...chosen],
					},
				}),
			),
		onSuccess: (data) => setResult(data.value),
	});

	const toggle = (key: keyof Persona, on: boolean) => {
		const next = new Set(chosen);
		if (on) next.add(key);
		else next.delete(key);
		setChosen(next);
	};

	const pending = generate.isPending && (
		<div className="flex flex-col gap-2">
			<Dot tone="info">書いています</Dot>
			<Meter value={1} tone="running" />
		</div>
	);

	if (result !== null)
		return (
			<>
				<DialogHeader>
					<DialogTitle>{label}をAIで書く</DialogTitle>
					<DialogDescription>
						手直ししてから入れられます。入れたあとも「保存」を押すまで保存されません。
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-2">
					<div className="flex items-center justify-between gap-2">
						<Label htmlFor="generate-result">書いた{label}</Label>
						<Dot tone={current ? "warning" : "info"}>{current ? "上書き" : "新規"}</Dot>
					</div>
					<Textarea
						id="generate-result"
						rows={6}
						className="max-h-[45vh] resize-y text-sm leading-relaxed"
						value={result}
						disabled={generate.isPending}
						onChange={(e) => setResult(e.target.value)}
					/>
					{current && (
						<p className="m-0 line-clamp-3 rounded-lg border-2 border-dashed px-3 py-2 text-xs whitespace-pre-wrap text-muted-foreground line-through decoration-border-strong">
							{current}
						</p>
					)}
				</div>
				{pending}
				<ErrorNote error={generate.error} />
				<DialogFooter className="items-center sm:justify-between">
					<Button
						variant="outline"
						disabled={generate.isPending}
						onClick={() => {
							generate.reset();
							setResult(null);
						}}
					>
						<ArrowLeft />
						補足を変える
					</Button>
					<div className="flex gap-2">
						<Button
							variant="outline"
							disabled={generate.isPending}
							onClick={() => generate.mutate()}
						>
							<RotateCcw />
							書き直す
						</Button>
						<Button
							disabled={generate.isPending || !result.trim()}
							onClick={() => onApply(result.trim())}
						>
							入れる
						</Button>
					</div>
				</DialogFooter>
			</>
		);

	return (
		<>
			<DialogHeader>
				<DialogTitle>{label}をAIで書く</DialogTitle>
				<DialogDescription>
					補足と、チェックしたほかの項目をもとに書きます。
					{current && `今の${label}を下書きにして書き直します。`}
					モデルは返答のモデルを使います。
				</DialogDescription>
			</DialogHeader>
			<div className="flex flex-col gap-2">
				<Label htmlFor="generate-note">補足（任意）</Label>
				<Textarea
					id="generate-note"
					value={note}
					maxLength={2000}
					disabled={generate.isPending}
					placeholder={`${label}に入れたいこと、雰囲気、変えてほしいところなど`}
					onChange={(e) => setNote(e.target.value)}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between gap-2">
					<span className="text-sm font-bold">参考にするほかの項目</span>
					{others.length > 0 && (
						<Button
							size="sm"
							variant="ghost"
							disabled={generate.isPending}
							onClick={() => setChosen(chosen.size ? new Set() : new Set(others))}
						>
							{chosen.size ? "すべて外す" : "すべて選ぶ"}
						</Button>
					)}
				</div>
				{others.length === 0 ? (
					<p className="m-0 text-xs text-muted-foreground">
						ほかに埋まっている項目はありません。補足だけをもとに書きます。
					</p>
				) : (
					<div className="flex max-h-[35vh] flex-col gap-1.5 overflow-y-auto">
						{others.map((key) => {
							const on = chosen.has(key);
							return (
								<label
									key={key}
									className={cn(
										"grid cursor-pointer grid-cols-[auto_6.5rem_minmax(0,1fr)] items-center gap-3 rounded-lg border-2 px-3 py-1.5 text-xs",
										on && "border-pastel-yellow-edge bg-selected",
									)}
								>
									<Checkbox
										checked={on}
										disabled={generate.isPending}
										onCheckedChange={(value) => toggle(key, value)}
									/>
									<span className="text-sm font-bold">{FIELD_LABELS[key]}</span>
									<span className="truncate text-muted-foreground">{persona[key]}</span>
								</label>
							);
						})}
					</div>
				)}
			</div>
			{pending}
			<ErrorNote error={generate.error} />
			<DialogFooter>
				<Button variant="outline" onClick={onCancel}>
					キャンセル
				</Button>
				<Button disabled={generate.isPending} onClick={() => generate.mutate()}>
					<Sparkles />
					書く
				</Button>
			</DialogFooter>
		</>
	);
}
