import type { CharacterView } from "@nextroom/contracts";
import { expressionTagLabel } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Spinner } from "@nextroom/ui/components/spinner";
import { cn } from "@nextroom/ui/lib/utils";
import { Eraser, ImagePlus, Sparkles, Square, WandSparkles, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useConfirm } from "@/components/confirm";
import { DROP_HIGHLIGHT, useFileDrop } from "@/components/drop-zone";
import { SettingsSection } from "@/components/settings-section";
import { ErrorNote, Meter } from "@/components/status";
import { useChatSettings } from "@/hooks/queries";
import { useFilePicker } from "@/hooks/use-file-picker";
import { useExpressionActions } from "../expressions";
import { IMAGE_ACCEPT } from "../queries";
import { ExpressionCard } from "./expression-card";
import { ExpressionGenerateDialog } from "./expression-generate-dialog";
import { NeutralPanel } from "./neutral-panel";

export function CharacterExpressions({
	character,
	onChange,
}: {
	character: CharacterView;
	onChange: (c: CharacterView) => void;
}) {
	const settings = useChatSettings();
	const keyMissing = settings.data ? !settings.data.has_openrouter_api_key : false;
	const { upload, cutoutAll, cutting, tagAll, tagging, guesses, tagged, clearTags, batch, locked } =
		useExpressionActions(character, onChange);
	const pending = character.expressions.filter((e) => !e.cutout);
	const untagged = character.expressions.filter((e) => !e.tag && e.id !== character.neutral);
	const ordered = [
		...character.expressions.filter((e) => e.id === character.neutral),
		...character.expressions.filter((e) => e.id !== character.neutral),
	];
	const confirm = useConfirm();
	const tagCount = character.expressions.filter((e) => e.tag).length;
	const [generateOpen, setGenerateOpen] = useState(false);
	const drawing = batch.running && batch.data ? batch.data : null;
	const queued = drawing ? drawing.tags.slice(drawing.done + 1) : [];
	const drawingTag = drawing?.tags[drawing.done];
	const images = (files: Iterable<File>) =>
		[...files].filter((f) => IMAGE_ACCEPT.split(",").includes(f.type));
	const add = (files: File[]) => {
		if (files.length) upload.mutate(files);
	};
	const [dragging, drop] = useFileDrop((data) => add(images(data.files)));
	const picker = useFilePicker((files) => add(images(files)), {
		accept: IMAGE_ACCEPT,
		multiple: true,
	});

	return (
		<SettingsSection
			title="表情画像"
			description="画像1枚に、一覧から表情タグを1つ選んで付けます。「タグを自動で付ける」で、Decisions API に画像を見せて選ばせることもできます。「AI で作る」では、選んだタグの表情を参考画像などから画像生成で作ります（どちらも設定 → モデル）。通話中は、付けたタグを返答の LLM がセリフに合わせて選び、同じタグの画像が複数あるときはランダムに出し分けます。特に感情が出ていないときは Neutral の画像を表示し、これがキャラクターのアイコンにもなります。"
			className="gap-4"
		>
			<NeutralPanel character={character} onChange={onChange} />
			{keyMissing && (
				<p className="m-0 rounded-lg border-2 bg-selected px-3 py-2 text-xs">
					通話中の表情の切り替え・画像のタグ付け・表情画像の生成（OpenRouter のとき）には OpenRouter
					の API キー（.env の OPENROUTER_API_KEY）が必要です。
					<Link to="/settings/connections" className="font-bold text-warning">
						設定 → 接続
					</Link>
					で確認できます。
				</p>
			)}
			{drawing && (
				<div className="flex flex-col gap-2 rounded-xl border-2 border-pastel-lilac-edge bg-pastel-lilac/20 px-3.5 py-3">
					<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
						<span className="text-sm font-extrabold">表情画像を生成中</span>
						<span className="text-sm font-extrabold tabular-nums">
							{drawing.done} / {drawing.tags.length} 枚
						</span>
						{drawingTag !== undefined && (
							<span className="text-xs text-muted-foreground">
								{drawing.status === "queued" ? "順番待ち: " : "いま: "}
								{expressionTagLabel(drawingTag)}
							</span>
						)}
						<Button
							variant="outline"
							size="sm"
							className="ml-auto"
							disabled={batch.cancel.isPending}
							onClick={() => batch.cancel.mutate()}
						>
							{batch.cancel.isPending ? <Spinner /> : <Square />}
							中止
						</Button>
					</div>
					<Meter value={drawing.done / drawing.tags.length} tone="running" />
					<span className="text-xs text-muted-foreground">
						サーバーで1枚ずつ作るので、ページを離れても続きます。中止すると、生成中の1枚を取り消して残りを作りません。できた画像はそのまま残ります。
					</span>
				</div>
			)}
			{batch.error && (
				<div className="flex items-start gap-2">
					<div className="min-w-0 flex-1">
						<ErrorNote error={`表情画像の一括生成が止まりました: ${batch.error}`} />
					</div>
					<Button variant="ghost" size="icon-sm" aria-label="閉じる" onClick={batch.dismiss}>
						<X />
					</Button>
				</div>
			)}
			{character.expressions.length > 0 && (
				<div className="flex flex-wrap items-center gap-2.5">
					<Button
						variant="outline"
						size="sm"
						disabled={locked || untagged.length === 0}
						onClick={() => tagAll.mutate(untagged)}
					>
						{tagAll.isPending ? <Spinner /> : <Sparkles />}
						{tagging
							? `判定中… ${tagging.done + 1} / ${tagging.total}`
							: untagged.length
								? `タグを自動で付ける（${untagged.length}枚）`
								: "すべてタグ付き"}
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={locked || pending.length === 0}
						onClick={() => cutoutAll.mutate(pending)}
					>
						{cutoutAll.isPending ? <Spinner /> : <WandSparkles />}
						{cutting
							? `透過処理中… ${cutting.done + 1} / ${cutting.total}`
							: pending.length
								? `まとめて背景を透過（${pending.length}枚）`
								: "すべて透過済み"}
					</Button>
					<span className="text-xs text-muted-foreground">まだの画像を1枚ずつ順番に処理します</span>
					<Button
						variant="outline"
						size="sm"
						className="ml-auto"
						disabled={locked || tagCount === 0}
						onClick={async () => {
							const ok = await confirm({
								title: `${tagCount}枚の画像のタグをすべて空にしますか？`,
								action: "空にする",
								destructive: true,
							});
							if (ok) clearTags.mutate();
						}}
					>
						{clearTags.isPending ? <Spinner /> : <Eraser />}
						タグをすべて空にする
					</Button>
				</div>
			)}
			<ErrorNote
				error={
					tagAll.error ??
					cutoutAll.error ??
					clearTags.error ??
					batch.start.error ??
					batch.cancel.error
				}
			/>
			<div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
				{ordered.map((e) => (
					<ExpressionCard
						key={e.id}
						character={character}
						expression={e}
						onChange={onChange}
						processing={cutting?.key === e.id}
						judging={tagging?.key === e.id}
						guess={guesses[e.id]}
						onTagged={(result) => tagged(e.id, result)}
						locked={locked}
					/>
				))}
				{drawing && drawingTag !== undefined && (
					<div className="flex flex-col overflow-hidden rounded-xl border-2 bg-card">
						<div className="bg-checker flex aspect-square flex-col items-center justify-center gap-2 border-b-2">
							<Spinner className="size-7" />
							<span className="rounded-full border-2 bg-background px-2.5 text-xs font-extrabold">
								{drawing.status === "queued"
									? "順番待ち"
									: `生成中… ${drawing.done + 1} / ${drawing.tags.length}`}
							</span>
						</div>
						<div className="flex h-10 items-center px-3 text-sm font-bold">
							{expressionTagLabel(drawingTag)}
							<span className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">
								{drawingTag}
							</span>
						</div>
					</div>
				)}
				{queued.length > 0 && (
					<div className="flex flex-col overflow-hidden rounded-xl border-2 border-dashed">
						<div className="flex aspect-square items-center justify-center border-b-2 border-dashed bg-muted text-sm font-bold text-muted-foreground">
							あと {queued.length} 枚
						</div>
						<div className="flex h-10 items-center truncate px-3 text-xs font-bold text-muted-foreground">
							{queued.slice(0, 2).map(expressionTagLabel).join("・")}
							{queued.length > 2 && " ほか"}
						</div>
					</div>
				)}
				<button
					type="button"
					onClick={picker.open}
					{...drop}
					disabled={upload.isPending}
					className={cn(
						"flex min-h-48 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-muted-foreground p-3 text-center text-sm font-bold text-muted-foreground transition-colors duration-120 ease-smooth hover:bg-hover hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
						dragging && `${DROP_HIGHLIGHT} text-foreground`,
					)}
				>
					{upload.isPending ? <Spinner className="size-6" /> : <ImagePlus className="size-6" />}
					画像を追加
					<span className="text-xs font-normal">ドロップでも追加できます</span>
				</button>
				<button
					type="button"
					onClick={() => setGenerateOpen(true)}
					disabled={batch.running}
					className="flex min-h-48 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-primary bg-pastel-lilac/30 p-3 text-center text-sm font-bold text-primary transition-colors duration-120 ease-smooth hover:bg-pastel-lilac/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:border-muted-foreground disabled:bg-transparent disabled:text-muted-foreground"
				>
					{batch.running ? <Spinner className="size-6" /> : <Sparkles className="size-6" />}
					AI で作る
					<span className="text-xs font-normal">タグを選んで表情を生成</span>
				</button>
			</div>
			<ExpressionGenerateDialog
				character={character}
				open={generateOpen}
				onOpenChange={setGenerateOpen}
				onGenerate={(request) => batch.start.mutate(request)}
			/>
			{picker.input}
			<ErrorNote error={upload.error} />
		</SettingsSection>
	);
}
