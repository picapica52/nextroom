import type { FishAudioTtsModel, FishAudioVoice } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Checkbox } from "@nextroom/ui/components/checkbox";
import { Field, FieldDescription, FieldLabel } from "@nextroom/ui/components/field";
import { Input } from "@nextroom/ui/components/input";
import { Spinner } from "@nextroom/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { PlayButton } from "@/components/buttons";
import { useConfirm } from "@/components/confirm";
import { SimpleSelect } from "@/components/simple-select";
import { ErrorNote } from "@/components/status";
import { usePlayer } from "@/hooks/engine";
import { useFishAudioSearch, useFishAudioVoice, useFishAudioVoices } from "@/hooks/queries";
import { client, formatSeconds, read } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { useVoiceRefs } from "../voice-queries";
import { Fold } from "./elevenlabs-voice";

const sampleUrl = (id: string, model: FishAudioTtsModel | "") =>
	model ? `/api/fish-audio/voices/${encodeURIComponent(id)}/sample?model=${model}` : null;

/** A voice's id from what was pasted: the id itself, or the address of its page on Fish Audio. */
const idOf = (text: string) => /(?:^|\/)([0-9a-f]{32})(?:[/?#]|$)/.exec(text.trim())?.[1] ?? null;

function useVoicesChanged() {
	const qc = useQueryClient();
	return () => qc.invalidateQueries({ queryKey: qk.fishAudioVoices() });
}

/** The Fish Audio voice the character speaks with: one of the account's own, or one shared on
 *  Fish Audio found by its title or pasted id. One of the account's own can be deleted here. */
export function FishAudioVoiceField({
	model,
	value,
	onChange,
}: {
	model: FishAudioTtsModel | "";
	value: string;
	onChange: (voiceId: string) => void;
}) {
	const voices = useFishAudioVoices();
	const own = voices.data?.find((v) => v.id === value);
	const shared = useFishAudioVoice(value, Boolean(voices.data) && !own);
	const changed = useVoicesChanged();
	const player = usePlayer();
	const confirm = useConfirm();
	const remove = useMutation({
		mutationFn: (id: string) => read(client["fish-audio"].voices[":id"].$delete({ param: { id } })),
		onSuccess: changed,
	});
	const options = (voices.data ?? []).map((v) => ({ value: v.id, label: v.title }));
	if (value && voices.data && !own)
		options.unshift({
			value,
			label: shared.data ? `${shared.data.title}（公開の声）` : "（アカウントにない声）",
		});
	const sample = value ? sampleUrl(value, model) : null;

	return (
		<>
			<Field>
				<FieldLabel htmlFor="fish-audio-voice">声</FieldLabel>
				<div className="flex items-center gap-2">
					<div className="min-w-0 flex-1">
						<SimpleSelect
							id="fish-audio-voice"
							value={value || null}
							onChange={(v) => onChange(v ?? "")}
							options={options}
							placeholder={voices.isLoading ? "読み込み中…" : "声を選ぶ"}
						/>
					</div>
					{sample && (
						<PlayButton playing={player.isPlaying(sample)} onClick={() => player.toggle(sample)} />
					)}
					{own && (
						<Button
							variant="ghost"
							size="sm"
							className="text-destructive"
							disabled={remove.isPending}
							onClick={async () => {
								const ok = await confirm({
									title: `「${own.title}」を削除しますか？`,
									description:
										"Fish Audio のアカウントから消えます。この声を選んだキャラクターは話せなくなります。",
									action: "削除",
									destructive: true,
								});
								if (ok) remove.mutate(own.id);
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
			<FishAudioSearch model={model} onChoose={onChange} />
		</>
	);
}

/** Voices shared on Fish Audio, found by their title; a pasted id or page address is chosen as it is. */
function FishAudioSearch({
	model,
	onChoose,
}: {
	model: FishAudioTtsModel | "";
	onChoose: (voiceId: string) => void;
}) {
	const [text, setText] = useState("");
	const [title, setTitle] = useState("");
	const found = useFishAudioSearch(title);

	return (
		<Fold
			title="公開されている声から選ぶ"
			description="Fish Audio で公開されている日本語の声を名前で探します。声のページのアドレスや ID を貼り付けて選ぶこともできます。"
		>
			<form
				className="flex gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					const id = idOf(text);
					if (id) onChoose(id);
					else setTitle(text.trim());
				}}
			>
				<Input
					aria-label="声を探す"
					value={text}
					onChange={(e) => setText(e.target.value)}
					placeholder="名前、または声のページのアドレス"
				/>
				<Button type="submit" variant="outline" disabled={!text.trim()}>
					<Search />
					{idOf(text) ? "選ぶ" : "探す"}
				</Button>
			</form>
			{found.isFetching && <Spinner className="size-4 text-muted-foreground" />}
			{found.data && !found.data.length && (
				<p className="m-0 text-xs text-muted-foreground">見つかりませんでした。</p>
			)}
			{found.data && found.data.length > 0 && (
				<ul className="m-0 flex list-none flex-col divide-y rounded-lg border-2 p-0">
					{found.data.map((v) => (
						<SharedVoice key={v.id} voice={v} model={model} onChoose={onChoose} />
					))}
				</ul>
			)}
			<ErrorNote error={found.error} />
		</Fold>
	);
}

function SharedVoice({
	voice,
	model,
	onChoose,
}: {
	voice: FishAudioVoice;
	model: FishAudioTtsModel | "";
	onChoose: (voiceId: string) => void;
}) {
	const player = usePlayer();
	const sample = sampleUrl(voice.id, model);
	return (
		<li className="flex items-center gap-2 px-3 py-2">
			<div className="flex min-w-0 flex-1 flex-col">
				<span className="truncate text-sm">{voice.title}</span>
				{voice.description && (
					<span className="truncate text-xs text-muted-foreground">{voice.description}</span>
				)}
			</div>
			{sample && (
				<PlayButton playing={player.isPlaying(sample)} onClick={() => player.toggle(sample)} />
			)}
			<Button variant="outline" size="sm" onClick={() => onChoose(voice.id)}>
				選ぶ
			</Button>
		</li>
	);
}

/** A voice cloned from the character's reference clips, kept private to the account; the new
 *  voice is chosen. */
export function FishAudioClone({
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
	const [enhance, setEnhance] = useState(true);
	const clone = useMutation({
		mutationFn: () =>
			read(
				client["fish-audio"].voices.clone.$post({
					json: { character_id: characterId, name: name.trim(), enhance_audio_quality: enhance },
				}),
			),
		onSuccess: ({ voice_id }) => {
			changed();
			onCreated(voice_id);
		},
	});
	const clips = refs.data?.clips.length ?? 0;
	const withText = refs.data?.clips.every((c) => c.text?.trim()) ?? false;

	return (
		<Fold
			title="このキャラクターの参照音声から複製"
			description={
				clips
					? `下の参照音声 ${clips} 件（${formatSeconds(refs.data?.seconds)}）を Fish Audio に送って、非公開の声を作ります。${withText ? "書き起こしも一緒に送ります。" : "書き起こしのない音声があるため、書き起こしは Fish Audio が行います。"}`
					: "参照音声がありません。下の「参照音声」に音声を追加すると複製できます。"
			}
		>
			<Field>
				<FieldLabel htmlFor="fish-clone-name">名前</FieldLabel>
				<Input id="fish-clone-name" value={name} onChange={(e) => setName(e.target.value)} />
			</Field>
			<label htmlFor="fish-clone-enhance" className="flex items-center gap-2 text-sm">
				<Checkbox
					id="fish-clone-enhance"
					checked={enhance}
					onCheckedChange={(on) => setEnhance(on)}
				/>
				音質を補正する
			</label>
			<div className="flex flex-wrap items-center gap-3">
				<Button
					disabled={!clips || clips > 20 || !name.trim() || clone.isPending}
					onClick={() => clone.mutate()}
				>
					{clone.isPending && <Spinner />}
					{clone.isPending ? "複製中…" : "複製する"}
				</Button>
				{clips > 20 && (
					<span className="text-xs text-warning">Fish Audio に送れるのは20件までです</span>
				)}
				{clone.isSuccess && (
					<span className="text-xs text-success">声を追加して、この声を選びました</span>
				)}
			</div>
			<ErrorNote error={clone.error} />
		</Fold>
	);
}
