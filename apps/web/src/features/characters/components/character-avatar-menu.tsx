import type { CharacterView } from "@nextroom/contracts";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@nextroom/ui/components/dropdown-menu";
import { Spinner } from "@nextroom/ui/components/spinner";
import { ImagePlus, Smile, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFilePicker } from "@/hooks/use-file-picker";
import { errorMessage } from "@/lib/api";
import { useNeutralActions } from "../expressions";
import { IMAGE_ACCEPT } from "../queries";
import { CharacterAvatar } from "./character-avatar";
import { NeutralGenerateDialog } from "./neutral-generate-dialog";

/** The character's picture, its neutral face; clicking it sets the face (or leaves it unset). */
export function AvatarMenu({
	character,
	onChange,
}: {
	character: CharacterView;
	onChange: (c: CharacterView) => void;
}) {
	const navigate = useNavigate();
	const { upload, unset } = useNeutralActions(character.id, onChange);
	const [generating, setGenerating] = useState(false);
	const picker = useFilePicker(
		([file]) => {
			if (file) upload.mutate(file);
		},
		{ accept: IMAGE_ACCEPT },
	);
	const error = upload.error ?? unset.error;
	return (
		<div className="flex flex-col items-center gap-1">
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<button
							type="button"
							className="group/avatar relative rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
							aria-label="アイコンを変更"
						/>
					}
				>
					<CharacterAvatar character={character} className="size-12 md:size-20" />
					<span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover/avatar:opacity-100">
						{upload.isPending || unset.isPending ? <Spinner /> : <ImagePlus className="size-5" />}
					</span>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					<DropdownMenuItem onClick={picker.open}>
						<ImagePlus />
						画像をアップロードして Neutral にする
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => setGenerating(true)}>
						<Sparkles />
						参考画像から生成…
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => navigate(`/characters/${character.id}/expressions`)}>
						<Smile />
						表情画像から選ぶ
					</DropdownMenuItem>
					{character.has_avatar && (
						<DropdownMenuItem variant="destructive" onClick={() => unset.mutate()}>
							<X />
							Neutral の指定を外す
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
			{picker.input}
			<NeutralGenerateDialog
				character={character}
				open={generating}
				onOpenChange={setGenerating}
				onChange={onChange}
			/>
			{error != null && (
				<span className="max-w-24 truncate text-[11px] text-destructive" title={String(error)}>
					{errorMessage(error)}
				</span>
			)}
		</div>
	);
}
