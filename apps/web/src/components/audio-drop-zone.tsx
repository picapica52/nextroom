import { Button } from "@nextroom/ui/components/button";
import { Upload } from "lucide-react";
import { useState } from "react";
import { useFileDrop } from "@/components/drop-zone";
import { ErrorNote, Meter } from "@/components/status";
import { useFilePicker } from "@/hooks/use-file-picker";
import { formatBytes } from "@/lib/api";
import { AUDIO_EXTS, filesFromDrop, type PickedFile, pickedFiles } from "@/lib/audio-upload";

/** Drop target plus file/folder pickers for audio uploads. */
export function AudioDropZone({
	disabled,
	onAdd,
	hint = "wav / flac / ogg / mp3 / opus。フォルダはサブフォルダも含めて読み込みます",
	compact = false,
}: {
	disabled?: boolean;
	onAdd: (files: PickedFile[]) => void;
	hint?: string;
	compact?: boolean;
}) {
	const [dropError, setDropError] = useState<unknown>(null);
	const [, drop] = useFileDrop(
		(data) => {
			if (disabled) return;
			setDropError(null);
			filesFromDrop(data).then(onAdd, setDropError);
		},
		`gap-3 ${compact ? "py-5" : "py-9"}`,
	);
	const files = useFilePicker((picked) => onAdd(pickedFiles(picked)), {
		accept: AUDIO_EXTS.join(","),
		multiple: true,
	});
	const folder = useFilePicker((picked) => onAdd(pickedFiles(picked)), { directory: true });

	return (
		<div {...drop}>
			{!compact && (
				<span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
					<Upload className="size-5" />
				</span>
			)}
			<div className="text-sm font-medium">音声ファイルまたはフォルダをここにドロップ</div>
			<div className="text-xs text-muted-foreground">{hint}</div>
			<div className="flex flex-wrap justify-center gap-2">
				<Button variant="outline" disabled={disabled} onClick={files.open}>
					ファイルを選択
				</Button>
				<Button variant="outline" disabled={disabled} onClick={folder.open}>
					フォルダを選択
				</Button>
			</div>
			<ErrorNote error={dropError} />
			{files.input}
			{folder.input}
		</div>
	);
}

/** Bytes sent so far while an upload runs. */
export function UploadProgress({ progress }: { progress: { sent: number; total: number } | null }) {
	if (!progress) return null;
	return (
		<div className="flex flex-col gap-1.5">
			<div className="text-xs text-muted-foreground">
				アップロード中 {formatBytes(progress.sent)} / {formatBytes(progress.total)}
			</div>
			<Meter value={progress.total ? progress.sent / progress.total : 0} tone="running" />
		</div>
	);
}
