import { Button } from "@nextroom/ui/components/button";
import { cn } from "@nextroom/ui/lib/utils";
import { ArrowUp, Captions, ImagePlus, X } from "lucide-react";
import { type ComponentProps, useEffect, useState } from "react";
import { useFilePicker } from "@/hooks/use-file-picker";
import { isSubmitEnter } from "@/lib/keyboard";
import { MicButton } from "../voice/mic-button";

/** Images one turn may carry (the server's limit too). */
const MAX_IMAGES = 8;

const imagesOf = (files: Iterable<File>) => [...files].filter((f) => f.type.startsWith("image/"));

/** The bar under the face: the captions toggle, typing with images attached, and the microphone. */
export function Composer({
	draft,
	onDraft,
	images,
	onImages,
	placeholder,
	canSend,
	onSend,
	captions,
	onCaptions,
	mic,
}: {
	draft: string;
	onDraft: (text: string) => void;
	images: File[];
	onImages: (images: File[]) => void;
	placeholder: string;
	canSend: boolean;
	onSend: () => void;
	captions: boolean;
	onCaptions: (on: boolean) => void;
	mic: ComponentProps<typeof MicButton>;
}) {
	const attach = (files: File[]) => onImages([...images, ...files].slice(0, MAX_IMAGES));
	const picker = useFilePicker((files) => attach(imagesOf(files)), {
		accept: "image/*",
		multiple: true,
	});
	return (
		<div className="flex flex-col gap-2">
			{images.length > 0 && (
				<div className="flex flex-wrap gap-2 px-2">
					{images.map((file, i) => (
						<AttachedImage
							// biome-ignore lint/suspicious/noArrayIndexKey: the same file may be attached twice
							key={i}
							file={file}
							onRemove={() => onImages(images.filter((_, j) => j !== i))}
						/>
					))}
				</div>
			)}
			<div className="flex items-center gap-2 rounded-[2rem] border-2 bg-card p-1.5 shadow-puff-lg sm:gap-2.5 sm:p-2">
				<button
					type="button"
					aria-label="字幕"
					aria-pressed={captions}
					title={captions ? "字幕を隠す" : "字幕を出す"}
					onClick={() => onCaptions(!captions)}
					className={cn(
						"flex size-11 shrink-0 items-center justify-center rounded-full border-2 transition-[translate,box-shadow,background-color] duration-120 ease-smooth outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-[3px] active:shadow-none [&_svg]:size-4.5",
						captions
							? "border-pastel-lilac-edge bg-pastel-lilac shadow-[0_3px_0_0_var(--pastel-lilac-shadow)]"
							: "bg-background shadow-puff hover:bg-muted",
					)}
				>
					<Captions />
				</button>
				<form
					className="flex min-w-0 flex-1 items-end gap-1.5 rounded-[1.5rem] border-2 border-input bg-muted py-1 pr-1 pl-4 transition-[border-color,box-shadow] duration-160 ease-smooth focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/25"
					onSubmit={(e) => {
						e.preventDefault();
						onSend();
					}}
				>
					{picker.input}
					<button
						type="button"
						aria-label="画像を添付"
						title={`画像を添付（${MAX_IMAGES} 枚まで）`}
						disabled={images.length >= MAX_IMAGES}
						onClick={picker.open}
						className="-ml-2.5 flex size-9 shrink-0 items-center justify-center self-center rounded-full text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 [&_svg]:size-4.5"
					>
						<ImagePlus />
					</button>
					<label htmlFor="chat-message" className="sr-only">
						メッセージ
					</label>
					<textarea
						id="chat-message"
						rows={1}
						autoComplete="off"
						className="field-sizing-content max-h-40 min-h-9 min-w-0 flex-1 resize-none self-center border-0 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
						value={draft}
						placeholder={placeholder}
						onChange={(e) => onDraft(e.target.value)}
						onPaste={(e) => {
							const pasted = imagesOf(e.clipboardData.files);
							if (!pasted.length) return;
							e.preventDefault();
							attach(pasted);
						}}
						onKeyDown={(e) => {
							if (isSubmitEnter(e)) {
								e.preventDefault();
								onSend();
							}
						}}
					/>
					{draft.trim() || images.length ? (
						<Button
							type="submit"
							size="icon"
							className="size-9 animate-pop rounded-full"
							aria-label="送信"
							title="送信"
							disabled={!canSend}
						>
							<ArrowUp />
						</Button>
					) : null}
				</form>
				<MicButton {...mic} />
			</div>
		</div>
	);
}

/** An image waiting to be sent, with a button to take it off. */
function AttachedImage({ file, onRemove }: { file: File; onRemove: () => void }) {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		const objectUrl = URL.createObjectURL(file);
		setUrl(objectUrl);
		return () => URL.revokeObjectURL(objectUrl);
	}, [file]);
	return (
		<div className="relative size-16 shrink-0 animate-pop overflow-hidden rounded-xl border-2 bg-muted shadow-puff">
			{url && <img src={url} alt={file.name} className="size-full object-cover" />}
			<button
				type="button"
				aria-label={`${file.name} を外す`}
				title="外す"
				onClick={onRemove}
				className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-foreground/70 text-background outline-none hover:bg-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3"
			>
				<X />
			</button>
		</div>
	);
}
