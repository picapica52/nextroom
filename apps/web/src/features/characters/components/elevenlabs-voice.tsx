import type { ElevenlabsTtsModel, ElevenlabsVoicePreview } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Checkbox } from "@nextroom/ui/components/checkbox";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@nextroom/ui/components/collapsible";
import { Field, FieldDescription, FieldLabel } from "@nextroom/ui/components/field";
import { Input } from "@nextroom/ui/components/input";
import { Spinner } from "@nextroom/ui/components/spinner";
import { Textarea } from "@nextroom/ui/components/textarea";
import { cn } from "@nextroom/ui/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Sparkles } from "lucide-react";
import { type ReactNode, useState } from "react";
import { PlayButton } from "@/components/buttons";
import { useConfirm } from "@/components/confirm";
import { SimpleSelect } from "@/components/simple-select";
import { ErrorNote } from "@/components/status";
import { usePlayer } from "@/hooks/engine";
import { useElevenlabsVoices } from "@/hooks/queries";
import { client, elevenlabsCategoryLabel, formatClock, formatSeconds, read } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { useVoiceRefs } from "../voice-queries";

function useVoicesChanged() {
	const qc = useQueryClient();
	return () => qc.invalidateQueries({ queryKey: qk.elevenlabsVoices() });
}

/** The ElevenLabs voice the character speaks with, from the account's voices; one of the
 *  account's own can be deleted from here. */
export function ElevenlabsVoiceField({
	model,
	value,
	onChange,
}: {
	model: ElevenlabsTtsModel | "";
	value: string;
	onChange: (voiceId: string) => void;
}) {
	const voices = useElevenlabsVoices();
	const changed = useVoicesChanged();
	const player = usePlayer();
	const confirm = useConfirm();
	const remove = useMutation({
		mutationFn: (id: string) => read(client.elevenlabs.voices[":id"].$delete({ param: { id } })),
		onSuccess: changed,
	});
	const options = (voices.data ?? []).map((v) => ({
		value: v.voice_id,
		label: `${v.name}（${elevenlabsCategoryLabel(v.category)}）`,
	}));
	// A voice deleted from the account still shows, so it can be told and replaced.
	if (value && voices.data && !options.some((o) => o.value === value))
		options.unshift({ value, label: "（アカウントにない声）" });
	const chosen = voices.data?.find((v) => v.voice_id === value);
	const sample =
		chosen && model
			? `/api/elevenlabs/voices/${encodeURIComponent(chosen.voice_id)}/sample?model=${model}`
			: null;

	return (
		<Field>
			<FieldLabel htmlFor="elevenlabs-voice">声</FieldLabel>
			<div className="flex items-center gap-2">
				<div className="min-w-0 flex-1">
					<SimpleSelect
						id="elevenlabs-voice"
						value={value || null}
						onChange={(v) => onChange(v ?? "")}
						options={options}
						placeholder={voices.isLoading ? "読み込み中…" : "声を選ぶ"}
					/>
				</div>
				{sample && (
					<PlayButton playing={player.isPlaying(sample)} onClick={() => player.toggle(sample)} />
				)}
				{chosen && chosen.category !== "premade" && (
					<Button
						variant="ghost"
						size="sm"
						className="text-destructive"
						disabled={remove.isPending}
						onClick={async () => {
							const ok = await confirm({
								title: `「${chosen.name}」を削除しますか？`,
								description:
									"ElevenLabs のアカウントから消えます。この声を選んだキャラクターは話せなくなります。",
								action: "削除",
								destructive: true,
							});
							if (ok) remove.mutate(chosen.voice_id);
						}}
					>
						削除
					</Button>
				)}
			</div>
			<FieldDescription className="text-xs">
				{value
					? "試聴は短い文を生成するため、クレジットを少し使います。"
					: "声を選ぶまで、このキャラクターはテキストだけで返答します。"}
			</FieldDescription>
			<ErrorNote error={voices.error ?? remove.error} />
		</Field>
	);
}

function Fold({
	title,
	description,
	defaultOpen = false,
	children,
}: {
	title: string;
	description: string;
	defaultOpen?: boolean;
	children: ReactNode;
}) {
	return (
		<Collapsible defaultOpen={defaultOpen} className="rounded-xl border-2">
			<CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-2.5 text-left font-bold">
				<ChevronRight
					className="size-4 shrink-0 text-primary transition-transform group-data-[panel-open]:rotate-90"
					aria-hidden="true"
				/>
				{title}
			</CollapsibleTrigger>
			<CollapsibleContent className="flex flex-col gap-3 px-4 pb-4">
				<p className="m-0 text-xs leading-relaxed text-muted-foreground">{description}</p>
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}

/** Instant Voice Clone from the character's reference clips; the new voice is chosen. */
export function ElevenlabsClone({
	characterId,
	name: defaultName,
	onCreated,
}: {
	characterId: string;
	name: string;
	onCreated: (voiceId: string) => void;
}) {
	const changed = useVoicesChanged();
	const refs = useVoiceRefs(characterId);
	const [name, setName] = useState(defaultName);
	const [denoise, setDenoise] = useState(false);
	const clone = useMutation({
		mutationFn: () =>
			read(
				client.elevenlabs.voices.clone.$post({
					json: {
						character_id: characterId,
						name: name.trim(),
						remove_background_noise: denoise,
					},
				}),
			),
		onSuccess: ({ voice_id }) => {
			changed();
			onCreated(voice_id);
		},
	});
	const clips = refs.data?.clips.length ?? 0;

	return (
		<Fold
			title="このキャラクターの参照音声から複製"
			description={
				clips
					? `下の参照音声 ${clips} 件（${formatSeconds(refs.data?.seconds)}）を ElevenLabs に送って声を複製します（Instant Voice Clone）。合計 1〜2 分ほどの、雑音の少ない声が向いています。`
					: "参照音声がありません。下の「参照音声」に音声を追加すると複製できます。"
			}
		>
			<Field>
				<FieldLabel htmlFor="clone-name">名前</FieldLabel>
				<Input id="clone-name" value={name} onChange={(e) => setName(e.target.value)} />
			</Field>
			<label htmlFor="clone-denoise" className="flex items-center gap-2 text-sm">
				<Checkbox id="clone-denoise" checked={denoise} onCheckedChange={(on) => setDenoise(on)} />
				背景の雑音を取り除く（雑音のない録音では音質が落ちることがあります）
			</label>
			<div className="flex flex-wrap items-center gap-3">
				<Button disabled={!clips || !name.trim() || clone.isPending} onClick={() => clone.mutate()}>
					{clone.isPending && <Spinner />}
					{clone.isPending ? "複製中…" : "複製する"}
				</Button>
				{clone.isSuccess && (
					<span className="text-xs text-success">声を追加して、この声を選びました</span>
				)}
			</div>
			<ErrorNote error={clone.error} />
		</Fold>
	);
}

/** Voice Design: candidates from a description, one of them saved to the account and chosen. */
export function ElevenlabsDesign({
	characterId,
	name: defaultName,
	onCreated,
}: {
	characterId: string;
	name: string;
	onCreated: (voiceId: string) => void;
}) {
	const changed = useVoicesChanged();
	const player = usePlayer();
	const [description, setDescription] = useState("");
	const [previews, setPreviews] = useState<ElevenlabsVoicePreview[]>([]);
	const [chosen, setChosen] = useState<string | null>(null);
	const [name, setName] = useState(defaultName);
	const describe = useMutation({
		mutationFn: () =>
			read(client.characters[":id"].voice.describe.$post({ param: { id: characterId } })),
		onSuccess: ({ value }) => setDescription(value),
	});
	const design = useMutation({
		mutationFn: () =>
			read(client.elevenlabs.voices.design.$post({ json: { description: description.trim() } })),
		onSuccess: (data) => {
			setPreviews(data);
			setChosen(data[0]?.generated_voice_id ?? null);
		},
	});
	const save = useMutation({
		mutationFn: () =>
			read(
				client.elevenlabs.voices.$post({
					json: {
						name: name.trim(),
						description: description.trim(),
						generated_voice_id: chosen ?? "",
					},
				}),
			),
		onSuccess: ({ voice_id }) => {
			setPreviews([]);
			setChosen(null);
			changed();
			onCreated(voice_id);
		},
	});
	const index = previews.findIndex((p) => p.generated_voice_id === chosen);

	return (
		<Fold
			title="説明文から作成"
			description="声の特徴を文章で書くと、候補をいくつか作ります（Voice Design）。試聴して気に入った声を保存します。"
		>
			<Field>
				<div className="flex items-center justify-between gap-2">
					<FieldLabel htmlFor="design-description">声の説明</FieldLabel>
					<Button
						variant="ghost"
						size="sm"
						disabled={describe.isPending}
						onClick={() => describe.mutate()}
					>
						{describe.isPending ? <Spinner /> : <Sparkles />}
						{describe.isPending ? "考え中…" : "プロフィールから考える"}
					</Button>
				</div>
				<Textarea
					id="design-description"
					rows={3}
					className="resize-y leading-relaxed"
					value={description}
					placeholder="年齢・性別・声の高さ・話し方などを書きます"
					onChange={(e) => setDescription(e.target.value)}
				/>
				<FieldDescription className="text-xs">候補は日本語の短い文章を話します。</FieldDescription>
				<ErrorNote error={describe.error} />
			</Field>
			<Button
				variant="secondary"
				className="self-start"
				disabled={!description.trim() || design.isPending}
				onClick={() => design.mutate()}
			>
				{design.isPending && <Spinner />}
				{design.isPending ? "作成中…" : previews.length ? "候補を作り直す" : "候補を作る"}
			</Button>
			<ErrorNote error={design.error} />
			{previews.length > 0 && (
				<>
					<div className="flex flex-col gap-1.5">
						{previews.map((p, i) => {
							const on = p.generated_voice_id === chosen;
							return (
								<div
									key={p.generated_voice_id}
									className={cn(
										"flex items-center gap-3 rounded-xl border-2 px-3 py-1.5",
										on && "border-pastel-yellow-edge bg-selected",
									)}
								>
									<PlayButton
										playing={player.isPlaying(p.audio)}
										onClick={() => player.toggle(p.audio)}
									/>
									<button
										type="button"
										aria-pressed={on}
										className="flex flex-1 items-center justify-between gap-2 text-left text-sm font-bold"
										onClick={() => setChosen(p.generated_voice_id)}
									>
										候補 {i + 1}
										<span className="font-mono text-xs font-normal text-muted-foreground">
											{formatClock(p.duration)}
										</span>
									</button>
								</div>
							);
						})}
					</div>
					<div className="flex flex-wrap gap-2">
						<Input
							aria-label="保存する名前"
							className="min-w-40 flex-1"
							placeholder="名前"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
						<Button
							disabled={!chosen || !name.trim() || save.isPending}
							onClick={() => save.mutate()}
						>
							{save.isPending && <Spinner />}
							候補 {index + 1} を保存
						</Button>
					</div>
					<ErrorNote error={save.error} />
				</>
			)}
		</Fold>
	);
}
