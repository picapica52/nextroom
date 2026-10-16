import { Button } from "@nextroom/ui/components/button";
import { Card, CardAction, CardHeader, CardTitle } from "@nextroom/ui/components/card";
import { Upload, X } from "lucide-react";
import { useState } from "react";
import { useFileDrop } from "@/components/drop-zone";
import { ErrorNote, Meter } from "@/components/status";
import { useFilePicker } from "@/hooks/use-file-picker";
import { formatBytes } from "@/lib/api";
import { AUDIO_EXTS, filesFromDrop, type PickedFile, pickedFiles } from "@/lib/audio-upload";

const LIST_LIMIT = 300;

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

/** The files waiting to be uploaded, each removable. */
export function PickedFileList({
	picked,
	ignored,
	totalBytes,
	busy,
	onRemove,
	onClear,
}: {
	picked: PickedFile[];
	ignored: number;
	totalBytes: number;
	busy: boolean;
	onRemove: (path: string) => void;
	onClear: () => void;
}) {
	if (picked.length === 0) return null;
	return (
		<Card className="gap-0 pb-0">
			<CardHeader className="border-b-2">
				<CardTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
					選んだファイル
					<span className="font-mono text-xs font-normal text-muted-foreground">
						{picked.length} ファイル · {formatBytes(totalBytes)}
					</span>
					{ignored > 0 && (
						<span className="text-xs font-normal text-warning">
							音声以外の {ignored} ファイルは除外
						</span>
					)}
				</CardTitle>
				<CardAction>
					<Button variant="ghost" size="sm" disabled={busy} onClick={onClear}>
						すべてクリア
					</Button>
				</CardAction>
			</CardHeader>
			<div className="max-h-[320px] overflow-y-auto">
				{picked.slice(0, LIST_LIMIT).map((f) => (
					<div
						key={f.path}
						className="grid grid-cols-[minmax(0,1fr)_80px_28px] items-center gap-2.5 border-b border-foreground/15 px-4 py-1 last:border-b-0"
					>
						<span className="truncate font-mono text-xs" title={f.path}>
							{f.path}
						</span>
						<span className="text-right font-mono text-xs text-muted-foreground">
							{formatBytes(f.file.size)}
						</span>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={`${f.path} を除外`}
							disabled={busy}
							onClick={() => onRemove(f.path)}
							className="text-muted-foreground"
						>
							<X />
						</Button>
					</div>
				))}
				{picked.length > LIST_LIMIT && (
					<div className="px-4 py-2 text-xs text-muted-foreground">
						ほか {picked.length - LIST_LIMIT} ファイル
					</div>
				)}
			</div>
		</Card>
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
