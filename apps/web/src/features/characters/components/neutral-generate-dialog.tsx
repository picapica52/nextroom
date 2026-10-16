import { type CharacterView, type ExpressionStyle, REFERENCE_SOURCE } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@nextroom/ui/components/dialog";
import { Spinner } from "@nextroom/ui/components/spinner";
import { ImagePlus, Sparkles } from "lucide-react";
import { useState } from "react";
import { ErrorNote } from "@/components/status";
import { useFilePicker } from "@/hooks/use-file-picker";
import { useNeutralActions } from "../expressions";
import { IMAGE_ACCEPT } from "../queries";
import {
	generationSources,
	ModelNote,
	PromptField,
	SourcePicker,
	StylePicker,
	useImageModel,
} from "./expression-generate-dialog";

/** Draws the neutral face from the reference image (or another face) and makes it the neutral one. */
export function NeutralGenerateDialog({
	character,
	open,
	onOpenChange,
	onChange,
}: {
	character: CharacterView;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onChange: (c: CharacterView) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="gap-4 sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Neutral を生成</DialogTitle>
					<DialogDescription>
						参照画像のキャラクターのまま、感情の出ていない普段の顔を描きます。できた画像は表情画像に加わり、そのまま
						Neutral（アイコン）になります。前の Neutral の画像は、タグなしの表情として残ります。
					</DialogDescription>
				</DialogHeader>
				<NeutralForm character={character} onChange={onChange} onDone={() => onOpenChange(false)} />
			</DialogContent>
		</Dialog>
	);
}

/** The dialog's choices; mounted with the dialog, so each opening starts afresh. */
function NeutralForm({
	character,
	onChange,
	onDone,
}: {
	character: CharacterView;
	onChange: (c: CharacterView) => void;
	onDone: () => void;
}) {
	const model = useImageModel();
	const { generate, setReference } = useNeutralActions(character.id, onChange);
	const sources = generationSources(character);
	const [chosen, setChosen] = useState<string | null>(null);
	const source = sources.find((s) => s.id === chosen) ?? sources[0];
	const [style, setStyle] = useState<ExpressionStyle>("bust");
	const [prompt, setPrompt] = useState("");
	const picker = useFilePicker(
		([file]) => {
			if (file)
				setReference.mutate(file, {
					onSuccess: () => setChosen(REFERENCE_SOURCE),
				});
		},
		{ accept: IMAGE_ACCEPT },
	);
	const uploadReference = (
		<button
			type="button"
			title={character.has_reference ? "参考画像を変更" : "参考画像をアップロード"}
			aria-label={character.has_reference ? "参考画像を変更" : "参考画像をアップロード"}
			disabled={setReference.isPending}
			onClick={picker.open}
			className="flex size-10 items-center justify-center rounded-md border-2 border-dashed border-muted-foreground text-muted-foreground transition-colors duration-120 ease-smooth hover:bg-hover hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
		>
			{setReference.isPending ? <Spinner /> : <ImagePlus className="size-4" />}
		</button>
	);

	return (
		<>
			{source ? (
				<div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
					<SourcePicker
						sources={sources}
						source={source}
						onChoose={setChosen}
						extra={uploadReference}
					/>
					<div className="flex min-w-0 flex-col gap-4">
						<StylePicker value={style} onChange={setStyle} />
						<PromptField id="neutral-prompt" value={prompt} onChange={setPrompt} />
					</div>
				</div>
			) : (
				<div className="flex flex-col items-start gap-2 rounded-lg border-2 bg-selected px-3 py-2.5 text-xs">
					元にする画像がありません。キャラクターの参考画像をアップロードしてください。
					<Button
						variant="outline"
						size="sm"
						disabled={setReference.isPending}
						onClick={picker.open}
					>
						{setReference.isPending ? <Spinner /> : <ImagePlus />}
						参考画像をアップロード
					</Button>
				</div>
			)}
			{picker.input}
			<ErrorNote error={setReference.error ?? generate.error} />
			<DialogFooter className="items-center sm:justify-between">
				<ModelNote model={model} />
				<div className="flex gap-2">
					<Button variant="outline" onClick={onDone}>
						キャンセル
					</Button>
					<Button
						disabled={!source || !model || generate.isPending}
						onClick={() => {
							if (!source) return;
							generate.mutate({ source: source.id, style, prompt }, { onSuccess: onDone });
						}}
					>
						{generate.isPending ? <Spinner /> : <Sparkles />}
						{generate.isPending ? "生成中…" : "生成して Neutral にする"}
					</Button>
				</div>
			</DialogFooter>
		</>
	);
}
