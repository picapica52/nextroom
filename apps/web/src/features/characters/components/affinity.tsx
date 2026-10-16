import type { AffinityView } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Heart, Mail, RotateCcw } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useConfirm } from "@/components/confirm";
import { SettingsSection } from "@/components/settings-section";
import { ErrorNote, Meter } from "@/components/status";
import { formatDate } from "@/lib/api";
import { useAffinity, useBackToFriends, useResetAffinity } from "../queries";

const SHOWN_ITEMS = 5;

/** How far into the current level, 0–1 (full at the top level). */
const progressOf = (a: AffinityView) =>
	a.next === null ? 1 : (a.value - a.from) / (a.next - a.from);

const levelName = (a: AffinityView) => `Lv${a.level} ${a.label}`;

const points = (a: AffinityView) => Math.floor(a.value);

/** What is left for the next level: the points, or the days once the points are there. */
function remaining(a: AffinityView): string {
	if (a.next === null) return "最高のレベルです";
	if (!a.waiting) return `次のレベルまで ${Math.ceil(a.next - a.value)}`;
	const { talked_days, known_days } = a.waiting;
	const known = `出会って${a.known_days + known_days}日たつと`;
	if (talked_days && known_days) return `あと${talked_days}日話して、${known}次のレベル`;
	if (talked_days) return `あと${talked_days}日話すと次のレベル`;
	if (known_days) return `${known}次のレベル`;
	return "次に話すと次のレベル";
}

/** The level as a small pill with a meter, beside the conversation's partner. */
export function AffinityBadge({ characterId }: { characterId: string | null }) {
	const { data } = useAffinity(characterId);
	if (!characterId || !data) return null;
	return (
		<span
			className="inline-flex h-5.5 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-foreground/15 bg-pastel-peach px-2.5 text-xs font-bold whitespace-nowrap"
			title={`好感度 ${points(data)}（${remaining(data)}）`}
		>
			{levelName(data)}
			{data.next !== null && <Meter value={progressOf(data)} className="w-10" />}
		</span>
	);
}

/** The character's affinity: the level, the latest changes, the events and letters, and starting
 *  it over. */
export function AffinitySection({ characterId, name }: { characterId: string; name: string }) {
	const confirm = useConfirm();
	const { data, error } = useAffinity(characterId);
	const reset = useResetAffinity(characterId);
	const friends = useBackToFriends(characterId);
	const [letter, setLetter] = useState<number | null>(null);
	return (
		<SettingsSection
			title="好感度"
			description="話すほど上がり、下がることはありません。記憶を消去すると最初に戻ります。"
			action={
				<Button
					variant="ghost"
					size="sm"
					className="text-destructive"
					disabled={reset.isPending || !data?.value}
					onClick={async () => {
						if (
							await confirm({
								title: `${name} の好感度をリセットしますか？`,
								description:
									"はじめて話したときの状態に戻ります（イベント・手紙・恋人関係も消えます）。記憶はそのまま残ります。",
								action: "リセット",
								destructive: true,
							})
						)
							reset.mutate();
					}}
				>
					<RotateCcw />
					リセット
				</Button>
			}
		>
			<ErrorNote error={error ?? reset.error ?? friends.error} />
			{data && (
				<>
					<div className="flex flex-col gap-1.5">
						<div className="flex items-baseline justify-between gap-2">
							<span className="font-extrabold">{levelName(data)}</span>
							<span className="text-xs text-muted-foreground">
								{points(data)}（{remaining(data)}）
							</span>
						</div>
						{data.next !== null && <Meter value={progressOf(data)} />}
						{data.talked_days > 0 && (
							<span className="text-xs text-muted-foreground">
								話した日 {data.talked_days}日・出会って {data.known_days}日
							</span>
						)}
					</div>
					{data.relationship === "lover" && (
						<div className="flex items-center justify-between gap-2 text-sm">
							<span>
								<Heart className="inline size-4 text-pink-500" /> 恋人
								{data.lover_since && (
									<span className="text-xs text-muted-foreground">
										（{formatDate(data.lover_since)} から）
									</span>
								)}
							</span>
							<Button
								variant="ghost"
								size="sm"
								disabled={friends.isPending}
								onClick={async () => {
									if (
										await confirm({
											title: `${name} と友達に戻りますか？`,
											description: "好感度はそのままで、恋人ではなくなります。",
											action: "友達に戻す",
										})
									)
										friends.mutate();
								}}
							>
								友達に戻す
							</Button>
						</div>
					)}
					{data.gains.length > 0 && (
						<List title="最近のボーナス">
							{data.gains.slice(0, SHOWN_ITEMS).map((g) => (
								<Row key={`${g.at}-${g.reason}`} at={g.at}>
									{g.reason} <span className="text-muted-foreground">+{g.delta}</span>
								</Row>
							))}
						</List>
					)}
					{data.events.length > 0 && (
						<List title="イベント">
							{data.events.slice(0, SHOWN_ITEMS).map((e) => (
								<Row key={`${e.at}-${e.kind}`} at={e.at}>
									{e.label}
									{e.topic && e.topic !== e.label && (
										<span className="text-muted-foreground">（{e.topic}）</span>
									)}
								</Row>
							))}
						</List>
					)}
					{data.letters.length > 0 && (
						<List title="もらった手紙">
							{data.letters.map((l) => (
								<li key={l.at} className="border-b border-foreground/15 pb-1 last:border-0">
									<button
										type="button"
										className="flex w-full cursor-pointer justify-between gap-2 bg-transparent p-0 text-left"
										onClick={() => setLetter(letter === l.at ? null : l.at)}
									>
										<span>
											<Mail className="inline size-4" />{" "}
											{l.kind === "love_letter" ? "恋人への手紙" : "手紙"}
										</span>
										<span className="text-xs text-muted-foreground">{formatDate(l.at)}</span>
									</button>
									{letter === l.at && (
										<p className="m-0 mt-1 whitespace-pre-wrap text-sm leading-relaxed">{l.text}</p>
									)}
								</li>
							))}
						</List>
					)}
				</>
			)}
		</SettingsSection>
	);
}

function List({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs font-bold text-muted-foreground">{title}</span>
			<ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">{children}</ul>
		</div>
	);
}

function Row({ at, children }: { at: number; children: ReactNode }) {
	return (
		<li className="flex justify-between gap-2 border-b border-foreground/15 pb-1 last:border-0">
			<span>{children}</span>
			<span className="shrink-0 text-xs text-muted-foreground">{formatDate(at)}</span>
		</li>
	);
}
