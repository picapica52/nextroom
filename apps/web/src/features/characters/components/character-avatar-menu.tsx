import type { CharacterView } from "@nextroom/contracts";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@nextroom/ui/components/dropdown-menu";
import { Spinner } from "@nextroom/ui/components/spinner";
import { useMutation } from "@tanstack/react-query";
import { ImagePlus, X } from "lucide-react";
import { useFilePicker } from "@/hooks/use-file-picker";
import { api, client, errorMessage, fileForm, read } from "@/lib/api";
import { IMAGE_ACCEPT } from "../queries";
import { CharacterAvatar } from "./character-avatar";

/** The character's picture; clicking it uploads a new one (or removes it). */
export function AvatarMenu({
	character,
	onChange,
}: {
	character: CharacterView;
	onChange: (c: CharacterView) => void;
}) {
	const upload = useMutation({
		mutationFn: (file: File) =>
			api.put<CharacterView>(`/api/characters/${character.id}/avatar`, fileForm(file)),
		onSuccess: onChange,
	});
	const remove = useMutation({
		mutationFn: () =>
			read(client.characters[":id"].avatar.$delete({ param: { id: character.id } })),
		onSuccess: onChange,
	});
	const picker = useFilePicker(
		([file]) => {
			if (file) upload.mutate(file);
		},
		{ accept: IMAGE_ACCEPT },
	);
	const error = upload.error ?? remove.error;
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
						{upload.isPending || remove.isPending ? <Spinner /> : <ImagePlus className="size-5" />}
					</span>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					<DropdownMenuItem onClick={picker.open}>
						<ImagePlus />
						画像をアップロード
					</DropdownMenuItem>
					{character.has_avatar && (
						<DropdownMenuItem variant="destructive" onClick={() => remove.mutate()}>
							<X />
							アイコンを外す
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
			{picker.input}
			{error != null && (
				<span className="max-w-24 truncate text-[11px] text-destructive" title={String(error)}>
					{errorMessage(error)}
				</span>
			)}
		</div>
	);
}
