import {
	NEW_CHARACTER_NAME,
	PERSONA_FIELDS,
	PERSONA_SOURCE_EXTENSIONS,
	type Persona,
	type PersonaExtract,
} from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Checkbox } from "@nextroom/ui/components/checkbox";
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
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useFileDrop } from "@/components/drop-zone";
import { Dot, ErrorNote, Meter } from "@/components/status";
import { useFilePicker } from "@/hooks/use-file-picker";
import { api } from "@/lib/api";
import { FIELD_LABELS } from "../persona-labels";

const ACCEPT = PERSONA_SOURCE_EXTENSIONS.join(",");

const accepted = (file: File) =>
	PERSONA_SOURCE_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));

const sizeLabel = (bytes: number) =>
	bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Reads the user's files into the persona with the LLM; the fields chosen go to `onApply`. */
export function CharacterExtractDialog({
	characterId,
	persona,
	open,
	onOpenChange,
	onApply,
}: {
	characterId: string;
	persona: Persona;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onApply: (changes: Partial<Persona>) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="gap-4 sm:max-w-2xl">
				<ExtractForm
					characterId={characterId}
					persona={persona}
					onCancel={() => onOpenChange(false)}
					onApply={(changes) => {
						onApply(changes);
						onOpenChange(false);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}

/** Mounted with the dialog, so each opening starts afresh. */
function ExtractForm({
	characterId,
	persona,
	onCancel,
	onApply,
}: {
	characterId: string;
	persona: Persona;
	onCancel: () => void;
	onApply: (changes: Partial<Persona>) => void;
}) {
	const [files, setFiles] = useState<File[]>([]);
	const [note, setNote] = useState("");
	const [result, setResult] = useState<PersonaExtract | null>(null);
	const [chosen, setChosen] = useState<Set<keyof Persona>>(new Set());

	const add = (picked: File[]) => {
		const names = new Set(files.map((f) => f.name));
		setFiles([...files, ...picked.filter((f) => accepted(f) && !names.has(f.name))]);
	};
	const picker = useFilePicker(add, { accept: ACCEPT, multiple: true });
	const [, drop] = useFileDrop((data) => add(Array.from(data.files)), "gap-1 py-6");

	const extract = useMutation({
		mutationFn: () => {
			const form = new FormData();
			for (const file of files) form.append("files", file, file.name);
			form.append("note", note);
			form.append("persona", JSON.stringify(persona));
			return api.post<PersonaExtract>(`/api/characters/${characterId}/extract`, form);
		},
		onSuccess: (data) => {
			setResult(data);
			setChosen(
				new Set(
					changedFields(data, persona).filter(
						(key) =>
							!persona[key].trim() || (key === "name" && persona.name === NEW_CHARACTER_NAME),
					),
				),
			);
		},
	});

	if (result) {
		const changed = changedFields(result, persona);
		const missing = PERSONA_FIELDS.filter((key) => !result.persona[key]);
		const toggle = (key: keyof Persona, on: boolean) => {
			const next = new Set(chosen);
			if (on) next.add(key);
			else next.delete(key);
			setChosen(next);
		};
		return (
			<>
				<DialogHeader>
					<DialogTitle>読み取った内容</DialogTitle>
					<DialogDescription>
						チェックした項目をフォームに入れます。入れたあとも編集でき、「保存」を押すまで保存されません。
					</DialogDescription>
				</DialogHeader>
				<div className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto">
					{changed.length === 0 && (
						<p className="m-0 text-sm text-muted-foreground">
							今の設定と違う内容は見つかりませんでした。
						</p>
					)}
					{changed.map((key) => {
						const current = persona[key].trim();
						const on = chosen.has(key);
						return (
							<label
								key={key}
								className={cn(
									"grid cursor-pointer grid-cols-[auto_6rem_minmax(0,1fr)] items-start gap-3 rounded-lg border-2 px-3 py-2",
									on && "border-pastel-yellow-edge bg-selected",
								)}
							>
								<Checkbox
									checked={on}
									onCheckedChange={(value) => toggle(key, value)}
									className="mt-0.5"
								/>
								<span className="flex flex-col items-start gap-1 text-sm font-bold">
									{FIELD_LABELS[key]}
									<Dot tone={current ? "warning" : "info"}>{current ? "上書き" : "新規"}</Dot>
								</span>
								<span className="flex min-w-0 flex-col gap-1 text-xs leading-relaxed">
									{current && (
										<span className="line-clamp-2 whitespace-pre-wrap text-muted-foreground line-through decoration-border-strong">
											{current}
										</span>
									)}
									<span className="max-h-40 overflow-y-auto whitespace-pre-wrap">
										{result.persona[key]}
									</span>
								</span>
							</label>
						);
					})}
				</div>
				{missing.length > 0 && (
					<p className="m-0 text-xs text-muted-foreground">
						資料になかった項目: {missing.map((key) => FIELD_LABELS[key]).join("・")}
					</p>
				)}
				{result.truncated.map((t) => (
					<p
						key={t.name}
						className="m-0 rounded-lg border-2 border-pastel-yellow-edge bg-selected px-3 py-2 text-xs"
					>
						{t.name} は長いため、{t.total.toLocaleString()} 字のうち先頭の {t.read.toLocaleString()}{" "}
						字だけを読みました。
					</p>
				))}
				<DialogFooter className="items-center sm:justify-between">
					<Button variant="outline" onClick={() => setResult(null)}>
						<ArrowLeft />
						資料を選び直す
					</Button>
					<div className="flex gap-2">
						<Button variant="outline" onClick={onCancel}>
							キャンセル
						</Button>
						<Button
							disabled={chosen.size === 0}
							onClick={() =>
								onApply(
									Object.fromEntries([...chosen].map((key) => [key, result.persona[key] ?? ""])),
								)
							}
						>
							{chosen.size ? `${chosen.size}項目を入れる` : "入れる"}
						</Button>
					</div>
				</DialogFooter>
			</>
		);
	}

	return (
		<>
			<DialogHeader>
				<DialogTitle>資料から読み取る</DialogTitle>
				<DialogDescription>
					資料の内容から、名前・世界観・プロフィール・見た目・性格・喋り方・部屋の様子を書き起こします。資料にないことは空欄のままにします。モデルは返答のモデルを使います。
				</DialogDescription>
			</DialogHeader>
			<div {...drop}>
				<span className="text-sm font-bold">ここにファイルをドロップ</span>
				<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
					または
					<Button size="sm" variant="outline" onClick={picker.open} disabled={extract.isPending}>
						ファイルを選ぶ
					</Button>
				</span>
				<span className="text-xs text-muted-foreground">
					{PERSONA_SOURCE_EXTENSIONS.join(" / ")}（複数可）
				</span>
				{picker.input}
			</div>
			{files.length > 0 && (
				<ul className="m-0 flex list-none flex-col gap-1.5 p-0">
					{files.map((file) => (
						<li
							key={file.name}
							className="flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-sm"
						>
							<span className="min-w-0 flex-1 truncate">{file.name}</span>
							<span className="text-xs text-muted-foreground tabular-nums">
								{sizeLabel(file.size)}
							</span>
							<Button
								size="icon-xs"
								variant="ghost"
								aria-label={`${file.name} を外す`}
								disabled={extract.isPending}
								onClick={() => setFiles(files.filter((f) => f !== file))}
							>
								<X />
							</Button>
						</li>
					))}
				</ul>
			)}
			<div className="flex flex-col gap-2">
				<Label htmlFor="extract-note">補足説明（任意）</Label>
				<Textarea
					id="extract-note"
					value={note}
					maxLength={2000}
					disabled={extract.isPending}
					placeholder="誰の設定を取り出すか、どの時点の姿にするか、資料にない部分の扱いなど"
					onChange={(e) => setNote(e.target.value)}
				/>
			</div>
			{extract.isPending && (
				<div className="flex flex-col gap-2">
					<Dot tone="info">読み取り中</Dot>
					<Meter value={1} tone="running" />
				</div>
			)}
			<ErrorNote error={extract.error} />
			<DialogFooter>
				<Button variant="outline" onClick={onCancel}>
					キャンセル
				</Button>
				<Button disabled={files.length === 0 || extract.isPending} onClick={() => extract.mutate()}>
					<Sparkles />
					読み取る
				</Button>
			</DialogFooter>
		</>
	);
}

/** The fields the files gave, other than what the form already says. */
const changedFields = (result: PersonaExtract, persona: Persona) =>
	PERSONA_FIELDS.filter((key) => {
		const value = result.persona[key];
		return value !== undefined && value.trim() !== persona[key].trim();
	});
