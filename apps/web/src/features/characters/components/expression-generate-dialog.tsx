import {
	type CharacterView,
	type ExpressionBatch,
	type ExpressionStyle,
	type ExpressionTag,
	expressionTagLabel,
	REFERENCE_SOURCE,
} from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
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
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useChatSettings } from "@/hooks/queries";
import { expressionUrl, referenceUrl } from "@/lib/api";
import { EXPRESSION_STYLE_OPTIONS } from "../expression-styles";
import { ExpressionTagPicker } from "./expression-tag-picker";

/** Picks the reference image, the style, the tags to draw and extra instructions for "AI で作る". */
export function ExpressionGenerateDialog({
	character,
	open,
	onOpenChange,
	onGenerate,
}: {
	character: CharacterView;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onGenerate: (request: ExpressionBatch) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="gap-4 sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>AI で表情を作る</DialogTitle>
					<DialogDescription>
						参照画像のキャラクターのまま、選んだタグの表情を描いた画像を作ります。1タグにつき1枚、順番に作って一覧に加えます。生成はサーバーで進むので、ページを離れても続きます。
					</DialogDescription>
				</DialogHeader>
				<GenerateForm
					character={character}
					onCancel={() => onOpenChange(false)}
					onGenerate={(request) => {
						onGenerate(request);
						onOpenChange(false);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}

interface Source {
	id: string;
	url: string;
	label: string;
}

/** The images a face can be drawn from: the reference image, the neutral face, then the others. */
export function generationSources(character: CharacterView): Source[] {
	const reference = referenceUrl(character);
	const neutral = character.expressions.find((e) => e.id === character.neutral);
	const others = character.expressions.filter((e) => e !== neutral);
	return [
		...(reference ? [{ id: REFERENCE_SOURCE, url: reference, label: "参考画像" }] : []),
		...(neutral
			? [{ id: neutral.id, url: expressionUrl(character.id, neutral), label: "Neutral" }]
			: []),
		...others.map((e) => ({
			id: e.id,
			url: expressionUrl(character.id, e),
			label: expressionTagLabel(e.tag) || "タグなしの表情",
		})),
	];
}

/** The chosen image, large, with the others to switch to. `extra` goes after the choices. */
export function SourcePicker({
	sources,
	source,
	onChoose,
	extra,
}: {
	sources: Source[];
	source: Source;
	onChoose: (id: string) => void;
	extra?: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2">
			<span className="text-sm font-bold">参照画像</span>
			<img
				src={source.url}
				alt=""
				className="bg-checker aspect-square w-full rounded-lg border-2 object-cover"
			/>
			<span className="text-xs text-muted-foreground">{source.label}</span>
			{(sources.length > 1 || extra) && (
				<div className="flex flex-wrap gap-1.5">
					{sources.map((s) => (
						<button
							key={s.id}
							type="button"
							title={s.label}
							aria-label={`参照画像: ${s.label}`}
							aria-pressed={s === source}
							onClick={() => onChoose(s.id)}
							className={cn(
								"bg-checker size-10 overflow-hidden rounded-md border-2 transition-shadow duration-120 ease-smooth focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
								s === source && "ring-3 ring-primary",
							)}
						>
							<img src={s.url} alt="" className="size-full object-cover" />
						</button>
					))}
					{extra}
				</div>
			)}
		</div>
	);
}

export function StylePicker({
	value,
	onChange,
}: {
	value: ExpressionStyle;
	onChange: (style: ExpressionStyle) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<span className="text-sm font-bold">描き方</span>
			<div className="grid gap-2 sm:grid-cols-2">
				{EXPRESSION_STYLE_OPTIONS.map((o) => (
					<button
						key={o.value}
						type="button"
						aria-pressed={value === o.value}
						onClick={() => onChange(o.value)}
						className={cn(
							"flex flex-col gap-0.5 rounded-lg border-2 border-border bg-background px-2.5 py-2 text-left shadow-puff transition-[translate,box-shadow,background-color] duration-120 ease-smooth hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
							value === o.value &&
								"translate-y-[3px] border-pastel-yellow-edge bg-selected shadow-none hover:bg-selected",
						)}
					>
						<span className="text-sm font-bold">{o.label}</span>
						<span className="text-[11px] leading-snug text-muted-foreground">{o.note}</span>
					</button>
				))}
			</div>
		</div>
	);
}

export function PromptField({
	id,
	value,
	onChange,
}: {
	id: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>追加の指示（任意）</Label>
			<Textarea
				id={id}
				value={value}
				maxLength={1000}
				placeholder="例: 目を閉じて、頬を赤く"
				onChange={(e) => onChange(e.target.value)}
			/>
		</div>
	);
}

/** The image model faces are drawn with, from the settings. */
export function useImageModel() {
	return useChatSettings().data?.image_gen_model ?? "";
}

export function ModelNote({ model }: { model: string }) {
	return (
		<span className="text-xs text-muted-foreground">
			モデル: {model ? <span className="font-mono">{model}</span> : "未設定"}（設定 → モデル）
		</span>
	);
}

/** The dialog's choices; mounted with the dialog, so each opening starts afresh. */
function GenerateForm({
	character,
	onCancel,
	onGenerate,
}: {
	character: CharacterView;
	onCancel: () => void;
	onGenerate: (request: ExpressionBatch) => void;
}) {
	const model = useImageModel();
	const sources = generationSources(character);
	const [chosen, setChosen] = useState<string | null>(null);
	const source = sources.find((s) => s.id === chosen) ?? sources[0];
	const [style, setStyle] = useState<ExpressionStyle>("bust");
	const [tags, setTags] = useState<ExpressionTag[]>([]);
	const [prompt, setPrompt] = useState("");
	const used = new Set(character.expressions.map((e) => e.tag));

	return (
		<>
			{source ? (
				<div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
					<SourcePicker sources={sources} source={source} onChoose={setChosen} />
					<div className="flex min-w-0 flex-col gap-4">
						<StylePicker value={style} onChange={setStyle} />
						<ExpressionTagPicker tags={tags} used={used} onChange={setTags} />
						<PromptField id="generate-prompt" value={prompt} onChange={setPrompt} />
					</div>
				</div>
			) : (
				<p className="m-0 rounded-lg border-2 bg-selected px-3 py-2 text-xs">
					参照にする画像がありません。参考画像を設定するか、表情画像を追加してください。
				</p>
			)}
			<DialogFooter className="items-center sm:justify-between">
				<ModelNote model={model} />
				<div className="flex gap-2">
					<Button variant="outline" onClick={onCancel}>
						キャンセル
					</Button>
					<Button
						disabled={!source || !model || tags.length === 0}
						onClick={() => {
							if (!source) return;
							onGenerate({ tags, source: source.id, style, prompt });
						}}
					>
						<Sparkles />
						{tags.length ? `${tags.length}枚作る` : "作る"}
					</Button>
				</div>
			</DialogFooter>
		</>
	);
}
