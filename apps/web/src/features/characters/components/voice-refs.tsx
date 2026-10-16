import {
	type CharacterVoiceRefs,
	VOICE_FILE_MAX_SECONDS,
	type VoiceRef,
} from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Checkbox } from "@nextroom/ui/components/checkbox";
import { Field, FieldDescription } from "@nextroom/ui/components/field";
import { Spinner } from "@nextroom/ui/components/spinner";
import { Textarea } from "@nextroom/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { Mic, Trash2, Upload } from "lucide-react";
import { type ReactNode, useState } from "react";
import { AudioDropZone, UploadProgress } from "@/components/audio-drop-zone";
import { PlayButton } from "@/components/buttons";
import { useConfirm } from "@/components/confirm";
import { SpeechModelNote, useSpeechModel } from "@/components/speech-model";
import { Dot, type DotTone, EmptyNote, ErrorNote, JobMeter, Meter } from "@/components/status";
import { usePlayer } from "@/hooks/engine";
import { useRangeSelection } from "@/hooks/selection";
import { useFilePicker } from "@/hooks/use-file-picker";
import {
	api,
	client,
	fileForm,
	formatBytes,
	formatClock,
	formatDate,
	formatSeconds,
	read,
} from "@/lib/api";
import { isAudio, useAudioUpload } from "@/lib/audio-upload";
import { isSubmitEnter } from "@/lib/keyboard";
import { useVoiceRefJob, useVoiceRefs, useVoiceRefsChanged } from "../voice-queries";

/** Where the effect of more audio levels off. */
const ENOUGH_SECONDS = 30;

/** The character's reference clips, or why they cannot be shown. */
function WithRefs({
	characterId,
	children,
}: {
	characterId: string;
	children: (refs: CharacterVoiceRefs) => ReactNode;
}) {
	const refs = useVoiceRefs(characterId);
	if (!refs.data)
		return refs.error ? <ErrorNote error={refs.error} /> : <Dot tone="muted">読み込み中</Dot>;
	return children(refs.data);
}

/** The reference clips of a character, which its Voice Clone voice file and ElevenLabs' clone
 *  are made from. */
export function VoiceRefs({ characterId }: { characterId: string }) {
	return (
		<WithRefs characterId={characterId}>
			{(refs) => <RefClips characterId={characterId} refs={refs} />}
		</WithRefs>
	);
}

/** The voice file Voice Clone speaks with. */
export function VoiceFileField({ characterId }: { characterId: string }) {
	return (
		<WithRefs characterId={characterId}>
			{(refs) => <VoiceFile characterId={characterId} refs={refs} />}
		</WithRefs>
	);
}

const GRID = "grid-cols-[20px_32px_minmax(0,1fr)_32px]";

function RefClips({ characterId, refs }: { characterId: string; refs: CharacterVoiceRefs }) {
	const changed = useVoiceRefsChanged(characterId);
	const confirm = useConfirm();
	const player = usePlayer();
	const { checked, setChecked, toggle } = useRangeSelection();
	const upload = useAudioUpload((upload_id) =>
		read(
			client.characters[":id"].voice.refs.$post({
				param: { id: characterId },
				json: { upload_id },
			}),
		),
	);
	const add = useMutation({ mutationFn: upload.run, onSuccess: changed });
	const remove = useMutation({
		mutationFn: (ids: string[]) =>
			read(
				client.characters[":id"].voice.refs.delete.$post({
					param: { id: characterId },
					json: { ids },
				}),
			),
		onSuccess: (data) => {
			setChecked(new Set());
			changed(data);
		},
	});
	const { clips } = refs;
	const ids = clips.map((c) => c.id);
	// Clips deleted elsewhere drop out of the selection.
	const selected = ids.filter((id) => checked.has(id));
	const allChecked = clips.length > 0 && selected.length === clips.length;
	const removeAsked = async (ids: string[], title: string) => {
		if (await confirm({ title, action: "削除", destructive: true })) remove.mutate(ids);
	};

	return (
		<>
			<div className="overflow-hidden rounded-xl border-2">
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 bg-muted px-4 py-2.5">
					<span className="font-mono text-xs text-muted-foreground">{clips.length} 件</span>
					<SecondsGauge seconds={refs.seconds} />
					<Transcribe characterId={characterId} clips={clips} />
				</div>
				<div
					className={`grid h-9 ${GRID} items-center gap-x-2 border-b border-foreground/15 px-4 text-xs font-medium text-muted-foreground`}
				>
					<span className="flex">
						<Checkbox
							aria-label="すべて選択"
							checked={allChecked}
							indeterminate={selected.length > 0 && !allChecked}
							disabled={clips.length === 0}
							onCheckedChange={() => setChecked(new Set(allChecked ? [] : ids))}
						/>
					</span>
					{selected.length > 0 ? (
						<span className="col-span-3 flex items-center gap-2">
							<span className="text-foreground">{selected.length} 件を選択中</span>
							<Button
								variant="destructive"
								size="xs"
								disabled={remove.isPending}
								onClick={() =>
									removeAsked(selected, `選択した音声 ${selected.length} 件を削除しますか？`)
								}
							>
								<Trash2 />
								選択を削除
							</Button>
							<Button variant="ghost" size="xs" onClick={() => setChecked(new Set())}>
								選択を解除
							</Button>
						</span>
					) : (
						<>
							<span />
							<span>ファイル・文字起こし（クリックで修正）</span>
							<span />
						</>
					)}
				</div>
				{clips.length === 0 ? (
					<EmptyNote className="py-6">まだ参照音声がありません。下から追加してください。</EmptyNote>
				) : (
					<div className="divide-y divide-foreground/15">
						{clips.map((c) => (
							<ClipRow
								key={c.id}
								characterId={characterId}
								clip={c}
								player={player}
								checked={checked.has(c.id)}
								onCheck={(on, shift) => toggle(ids, c.id, on, shift)}
								deleting={remove.isPending}
								onDelete={() => removeAsked([c.id], `${c.name} を削除しますか？`)}
							/>
						))}
					</div>
				)}
				<div className="flex flex-col gap-2 border-t-2 p-3">
					<AudioDropZone
						compact
						disabled={add.isPending}
						onAdd={(files) => {
							const audio = files.filter((f) => isAudio(f.file.name));
							if (audio.length) add.mutate(audio);
						}}
						hint={`wav / flac / ogg / mp3 / opus。同じ話者の音声を合計${ENOUGH_SECONDS}秒前後入れるのがおすすめです`}
					/>
					{add.isPending && (
						<div className="flex items-center gap-3">
							<div className="flex-1">
								<UploadProgress progress={upload.progress} />
							</div>
							<Button variant="destructive" size="sm" onClick={upload.cancel}>
								中止
							</Button>
						</div>
					)}
					<ErrorNote error={add.error ?? remove.error} />
				</div>
			</div>
			<p className="m-0 text-xs text-muted-foreground">
				音声はこのキャラクターのフォルダに保存されます。ボイスファイルにできるのは合計
				{VOICE_FILE_MAX_SECONDS}秒までで、{ENOUGH_SECONDS}秒前後で効果が頭打ちになります。
			</p>
		</>
	);
}

/** The clips' total against the voice file's limit. */
function SecondsGauge({ seconds }: { seconds: number }) {
	const over = seconds > VOICE_FILE_MAX_SECONDS;
	return (
		<span className="flex items-center gap-2">
			<Meter
				value={seconds / VOICE_FILE_MAX_SECONDS}
				tone={over ? "stopped" : "default"}
				className="w-28"
			/>
			<span className={`font-mono text-xs ${over ? "text-warning" : "text-muted-foreground"}`}>
				{seconds.toFixed(1)} / {VOICE_FILE_MAX_SECONDS} 秒
			</span>
		</span>
	);
}

/** Transcribing the clips: a note for checking what they say, not used to speak. */
function Transcribe({ characterId, clips }: { characterId: string; clips: VoiceRef[] }) {
	const confirm = useConfirm();
	const asr = useSpeechModel("asr");
	const {
		active: job,
		failed,
		start,
		cancel,
	} = useVoiceRefJob(
		characterId,
		"ref_transcribe",
		(json: { overwrite: boolean }) =>
			read(
				client.characters[":id"].voice.refs.transcribe.$post({ param: { id: characterId }, json }),
			),
		"文字起こしに失敗しました",
	);
	const done = clips.filter((c) => c.text).length;
	const pending = clips.length - done;
	const busy = !!job || start.isPending;

	return (
		<div className="ml-auto flex min-w-0 flex-col items-end gap-1.5">
			{job ? (
				<div className="flex items-center gap-2">
					<div className="w-40">
						<JobMeter job={job} fallback="文字起こし待ち" />
					</div>
					<Button variant="destructive" size="xs" onClick={() => cancel.mutate(job.id)}>
						中止
					</Button>
				</div>
			) : (
				<div className="flex flex-wrap justify-end gap-1.5">
					<Button
						variant="outline"
						size="xs"
						disabled={!asr.ready || busy || pending === 0}
						onClick={() => start.mutate({ overwrite: false })}
					>
						<Mic />
						未文字起こしを実行（{pending}件）
					</Button>
					<Button
						variant="ghost"
						size="xs"
						disabled={!asr.ready || busy || done === 0}
						onClick={async () => {
							const ok = await confirm({
								title: "手で修正した内容も含め、すべて文字起こしし直しますか？",
								action: "やり直す",
								destructive: true,
							});
							if (ok) start.mutate({ overwrite: true });
						}}
					>
						すべてやり直す
					</Button>
				</div>
			)}
			{!asr.ready && clips.length > 0 && <SpeechModelNote task="asr" />}
			<ErrorNote error={start.error ?? failed} />
		</div>
	);
}

function ClipRow({
	characterId,
	clip,
	player,
	checked,
	onCheck,
	deleting,
	onDelete,
}: {
	characterId: string;
	clip: VoiceRef;
	player: ReturnType<typeof usePlayer>;
	checked: boolean;
	onCheck: (checked: boolean, shift: boolean) => void;
	deleting: boolean;
	onDelete: () => void;
}) {
	const changed = useVoiceRefsChanged(characterId);
	const refs = useVoiceRefs(characterId);
	const saved = clip.text ?? "";
	// Typing stays local until blur; a newer server value (e.g. a finished transcription) wins.
	const [draft, setDraft] = useState({ base: saved, text: saved });
	const text = draft.base === saved ? draft.text : saved;
	const save = useMutation({
		mutationFn: (value: string) =>
			read(
				client.characters[":id"].voice.refs[":rid"].$patch({
					param: { id: characterId, rid: clip.id },
					json: { text: value },
				}),
			),
		onSuccess: (updated) => {
			if (refs.data)
				changed({
					...refs.data,
					clips: refs.data.clips.map((c) => (c.id === updated.id ? updated : c)),
				});
		},
	});
	const url = `/api/characters/${characterId}/voice/refs/${clip.id}/audio`;
	return (
		<div
			className={`grid ${GRID} items-start gap-x-2 px-4 py-2 transition-colors duration-120 ease-smooth hover:bg-hover`}
		>
			<span className="flex pt-2">
				<Checkbox
					aria-label={`${clip.name} を選択`}
					checked={checked}
					// Keep Shift+click from selecting the text between the rows.
					onMouseDown={(e) => e.shiftKey && e.preventDefault()}
					onCheckedChange={(on, { event }) =>
						onCheck(on, event instanceof MouseEvent && event.shiftKey)
					}
				/>
			</span>
			<PlayButton playing={player.isPlaying(url)} onClick={() => player.toggle(url)} />
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className="flex min-w-0 items-center gap-2 pt-1">
					<span className="truncate font-mono text-xs text-foreground/80" title={clip.name}>
						{clip.name}
					</span>
					<span className="shrink-0 font-mono text-xs text-muted-foreground">
						{clip.duration ? formatClock(clip.duration) : "—"}
					</span>
					{clip.edited && (
						<span className="shrink-0 text-[11px] text-muted-foreground">修正済</span>
					)}
				</span>
				<Textarea
					aria-label={`${clip.name} の文字起こし`}
					rows={1}
					value={text}
					placeholder="未文字起こし"
					onChange={(e) => setDraft({ base: saved, text: e.target.value })}
					onBlur={() => text.trim() !== saved && save.mutate(text)}
					onKeyDown={(e) => {
						if (isSubmitEnter(e)) {
							e.preventDefault();
							e.currentTarget.blur();
						}
					}}
					className="-ml-2 min-h-0 resize-none border-transparent bg-transparent px-2 py-1 leading-relaxed hover:border-input focus-visible:bg-background md:text-sm"
				/>
				<ErrorNote error={save.error} />
			</span>
			<Button
				variant="ghost"
				size="icon-sm"
				aria-label={`${clip.name} を削除`}
				title={`${clip.name} を削除`}
				disabled={deleting}
				onClick={onDelete}
			>
				<Trash2 />
			</Button>
		</div>
	);
}

const STATUS: Record<CharacterVoiceRefs["voice_file_status"], { label: string; tone: DotTone }> = {
	ok: { label: "最新", tone: "success" },
	stale: { label: "要再作成", tone: "warning" },
	file: { label: "読み込んだファイル", tone: "success" },
	missing: { label: "未作成", tone: "destructive" },
};

/** The voice file Voice Clone speaks with: made from the clips, or read in from a file. */
function VoiceFile({ characterId, refs }: { characterId: string; refs: CharacterVoiceRefs }) {
	const confirm = useConfirm();
	const changed = useVoiceRefsChanged(characterId);
	const {
		active: job,
		failed,
		start: build,
		cancel,
	} = useVoiceRefJob(
		characterId,
		"ref_voice_file",
		() => read(client.characters[":id"].voice.file.$post({ param: { id: characterId } })),
		"ボイスファイルの作成に失敗しました",
	);
	const importFile = useMutation({
		mutationFn: (file: File) =>
			api.put<CharacterVoiceRefs>(`/api/characters/${characterId}/voice/file`, fileForm(file)),
		onSuccess: changed,
	});
	const remove = useMutation({
		mutationFn: () =>
			read(client.characters[":id"].voice.file.$delete({ param: { id: characterId } })),
		onSuccess: changed,
	});
	const { open: pick, input } = useFilePicker(
		([file]) => {
			if (file) importFile.mutate(file);
		},
		{ accept: ".wav,.gguf" },
	);
	const status = refs.voice_file_status;
	const info = refs.voice_file;
	const tooLong = refs.seconds > VOICE_FILE_MAX_SECONDS;
	const busy = !!job || build.isPending || importFile.isPending || remove.isPending;
	const shown = job
		? { label: job.status === "queued" ? "作成待ち" : "作成中", tone: "info" as const }
		: STATUS[status];

	return (
		<Field>
			<div className="flex flex-col gap-3 rounded-xl border-2 border-pastel-yellow-edge bg-selected/40 px-4 py-3">
				<div className="flex flex-wrap items-center gap-x-4 gap-y-3">
					<div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1">
						<span className="flex flex-wrap items-center gap-2">
							<span className="font-extrabold">ボイスファイル</span>
							<Dot tone={shown.tone}>{shown.label}</Dot>
						</span>
						<span className="text-xs leading-relaxed text-muted-foreground">
							{status === "ok" && info
								? `参照音声 ${info.clip_ids?.length ?? 0} 件・合計 ${formatSeconds(info.seconds)} を一覧の順に結合（${formatDate(info.created_at)} 作成）。`
								: status === "stale"
									? "作った後に下の参照音声が変わりました。作り直すまでは前のボイスファイルで話します。"
									: status === "file" && info
										? `${info.name}（${formatBytes(info.bytes)}・${formatDate(info.created_at)} 読み込み）で話します。参照音声から作ると置き換わります。`
										: "まだボイスファイルがないため、Voice Clone では話せません。下の参照音声から作成してください。"}
						</span>
					</div>
					<div className="flex flex-wrap gap-2">
						{job ? (
							<Button variant="destructive" size="sm" onClick={() => cancel.mutate(job.id)}>
								中止
							</Button>
						) : (
							<Button
								size="sm"
								variant={status === "ok" ? "outline" : "default"}
								disabled={refs.clips.length === 0 || tooLong || busy}
								onClick={() => build.mutate()}
							>
								{status === "missing" || status === "file"
									? "参照音声から作成"
									: "現在の参照音声で作り直す"}
							</Button>
						)}
						<Button variant="ghost" size="sm" disabled={busy} onClick={pick}>
							{importFile.isPending ? <Spinner /> : <Upload />}
							ファイルから読み込む
						</Button>
						{info && (
							<Button
								variant="ghost"
								size="sm"
								className="text-destructive"
								disabled={busy}
								onClick={async () => {
									const ok = await confirm({
										title: "ボイスファイルを削除しますか？",
										description: "参照音声は残ります。",
										action: "削除",
										destructive: true,
									});
									if (ok) remove.mutate();
								}}
							>
								削除
							</Button>
						)}
					</div>
				</div>
				{job && <JobMeter job={job} fallback="順番待ち" />}
				{!job && tooLong && (
					<span className="text-xs text-warning">
						参照音声が合計 {formatSeconds(refs.seconds)} あります。ボイスファイルにできるのは合計{" "}
						{VOICE_FILE_MAX_SECONDS} 秒までなので、音声を減らしてください。
					</span>
				)}
				<ErrorNote error={build.error ?? failed ?? importFile.error ?? remove.error} />
			</div>
			{input}
			<FieldDescription className="text-xs">
				「ファイルから読み込む」では、.wav か speech.cpp で作った .voice.gguf をそのまま使えます。
			</FieldDescription>
		</Field>
	);
}
