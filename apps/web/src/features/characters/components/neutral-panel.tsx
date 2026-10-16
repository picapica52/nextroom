import type { CharacterView } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Spinner } from "@nextroom/ui/components/spinner";
import { cn } from "@nextroom/ui/lib/utils";
import { ImagePlus, RefreshCw, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { ErrorNote } from "@/components/status";
import { useFilePicker } from "@/hooks/use-file-picker";
import { avatarUrl } from "@/lib/api";
import { useExpressionCardActions, useNeutralActions } from "../expressions";
import { IMAGE_ACCEPT } from "../queries";
import { NeutralGenerateDialog } from "./neutral-generate-dialog";

/** The neutral face, which is also the character's picture: uploaded, or generated. */
export function NeutralPanel({
	character,
	onChange,
}: {
	character: CharacterView;
	onChange: (c: CharacterView) => void;
}) {
	const { upload, unset } = useNeutralActions(character.id, onChange);
	const neutral = character.expressions.find((e) => e.id === character.neutral);
	const { regenerate } = useExpressionCardActions(
		character.id,
		neutral?.id ?? "",
		onChange,
		() => {},
	);
	const [generating, setGenerating] = useState(false);
	const picker = useFilePicker(
		([file]) => {
			if (file) upload.mutate(file);
		},
		{ accept: IMAGE_ACCEPT },
	);
	const image = avatarUrl(character);
	const busy = upload.isPending || regenerate.isPending;

	return (
		<div
			className={cn(
				"flex min-w-0 max-w-xl gap-3 rounded-xl border-2 bg-card p-2.5",
				image ? "border-primary ring-3 ring-pastel-lilac" : "border-dashed border-primary",
			)}
		>
			<div className="bg-checker relative size-26 shrink-0 overflow-hidden rounded-lg border-2">
				{image ? (
					<img src={image} alt="" className={cn("size-full object-cover", busy && "opacity-45")} />
				) : (
					<span className="flex size-full items-center justify-center bg-muted p-1 text-center text-xs font-bold text-muted-foreground">
						Neutral 未設定
					</span>
				)}
				{busy && (
					<span className="absolute inset-0 flex items-center justify-center">
						<Spinner className="size-6" />
					</span>
				)}
			</div>
			<div className="flex min-w-0 flex-col gap-1.5">
				<span className="text-sm font-extrabold">Neutral（アイコン）</span>
				<span className="text-xs text-muted-foreground">
					感情が出ていないときの顔。キャラクターのアイコンにも使います。
				</span>
				<div className="flex flex-wrap gap-1.5">
					<Button variant="outline" size="xs" disabled={upload.isPending} onClick={picker.open}>
						<ImagePlus />
						画像をアップロード
					</Button>
					<Button variant="outline" size="xs" onClick={() => setGenerating(true)}>
						<Sparkles />
						参考画像から生成
					</Button>
					{neutral?.generated && (
						<Button
							variant="outline"
							size="xs"
							title="同じ参照画像と指示で描き直します"
							disabled={regenerate.isPending}
							onClick={() => regenerate.mutate()}
						>
							{regenerate.isPending ? <Spinner /> : <RefreshCw />}
							作り直す
						</Button>
					)}
					{neutral && (
						<Button
							variant="outline"
							size="xs"
							className="text-destructive"
							title="画像は表情画像として残ります"
							disabled={unset.isPending}
							onClick={() => unset.mutate()}
						>
							<X />
							指定を外す
						</Button>
					)}
				</div>
				<ErrorNote error={upload.error ?? unset.error ?? regenerate.error} />
			</div>
			{picker.input}
			<NeutralGenerateDialog
				character={character}
				open={generating}
				onOpenChange={setGenerating}
				onChange={onChange}
			/>
		</div>
	);
}
