import type { RoutineView } from "@nextroom/contracts";
import { Badge } from "@nextroom/ui/components/badge";
import { Button } from "@nextroom/ui/components/button";
import { Switch } from "@nextroom/ui/components/switch";
import { ChevronRight, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useConfirm } from "@/components/confirm";
import { SettingsSection } from "@/components/settings-section";
import { Dot, EmptyNote, ErrorNote } from "@/components/status";
import { useRoutineActions, useRoutineRuns, useRoutines } from "../queries";
import { formatDateTime, formatNext, RUN_STATUS, scheduleText } from "../routine-schedule";
import { modelChoiceText } from "./model-choice-field";
import { RoutineFormDialog } from "./routine-form-dialog";

/** The ルーティン tab: what the character does on its own, at the times each routine says. */
export function CharacterRoutines({ characterId, name }: { characterId: string; name: string }) {
	const routines = useRoutines(characterId);
	const [creating, setCreating] = useState(false);
	return (
		<SettingsSection
			title="ルーティン"
			description={`決まった時間に、${name}が指示を実行します。結果は${name}からのメッセージとして会話に残ります。時刻はこのPCの時刻です。`}
			action={
				<Button variant="secondary" onClick={() => setCreating(true)}>
					<Plus />
					ルーティンを作成
				</Button>
			}
		>
			<ErrorNote error={routines.error} />
			{routines.data?.length === 0 && (
				<EmptyNote className="py-6">
					まだルーティンはありません。会話の中で頼むと、{name}が作ることもあります。
				</EmptyNote>
			)}
			{routines.data?.map((r) => (
				<RoutineCard key={r.id} characterId={characterId} routine={r} />
			))}
			<RoutineFormDialog characterId={characterId} open={creating} onOpenChange={setCreating} />
		</SettingsSection>
	);
}

function RoutineCard({ characterId, routine }: { characterId: string; routine: RoutineView }) {
	const { update, remove, run } = useRoutineActions(characterId);
	const [editing, setEditing] = useState(false);
	const [showRuns, setShowRuns] = useState(false);
	const confirm = useConfirm();

	const destroy = async () => {
		const ok = await confirm({
			title: `「${routine.name}」を削除しますか？`,
			description: "実行履歴も消えます。",
			action: "削除",
			destructive: true,
		});
		if (ok) remove.mutate(routine.id);
	};

	return (
		<div className="flex flex-col gap-2 rounded-lg border-2 px-3.5 py-3">
			<div className="flex items-start gap-3">
				<Switch
					className="mt-0.5"
					aria-label="有効"
					checked={routine.active}
					disabled={update.isPending}
					onCheckedChange={(active) => update.mutate({ id: routine.id, patch: { active } })}
				/>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<div className="flex flex-wrap items-center gap-1.5">
						<span className="truncate text-sm font-bold">{routine.name}</span>
						{routine.running && <Dot tone="info">実行中</Dot>}
						{routine.created_by === "character" && (
							<Badge variant="secondary">キャラクターが作成</Badge>
						)}
					</div>
					<div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
						<span className="font-bold text-foreground">{scheduleText(routine.trigger)}</span>
						<span>
							次回{" "}
							{routine.next_run_at
								? formatNext(routine.next_run_at)
								: routine.active
									? "なし"
									: "停止中"}
						</span>
						{routine.model && <span>{modelChoiceText(routine.model)}</span>}
					</div>
					<p className="m-0 line-clamp-2 text-xs whitespace-pre-wrap">{routine.instruction}</p>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-1">
				<Button
					variant="ghost"
					size="sm"
					aria-expanded={showRuns}
					onClick={() => setShowRuns((v) => !v)}
				>
					<ChevronRight
						className={showRuns ? "rotate-90 transition-transform" : "transition-transform"}
					/>
					実行履歴
				</Button>
				<span className="flex-1" />
				<Button
					variant="ghost"
					size="sm"
					disabled={routine.running || run.isPending}
					onClick={() => run.mutate(routine.id, { onSuccess: () => setShowRuns(true) })}
				>
					<Play />
					テスト実行
				</Button>
				<Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
					<Pencil />
					編集
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="text-destructive"
					disabled={remove.isPending}
					onClick={() => void destroy()}
				>
					<Trash2 />
					削除
				</Button>
			</div>

			<ErrorNote error={run.error ?? update.error ?? remove.error} />
			{showRuns && <RoutineRuns routineId={routine.id} running={routine.running} />}

			<RoutineFormDialog
				characterId={characterId}
				routine={routine}
				open={editing}
				onOpenChange={setEditing}
			/>
		</div>
	);
}

function RoutineRuns({ routineId, running }: { routineId: string; running: boolean }) {
	const runs = useRoutineRuns(routineId, running);
	return (
		<div className="flex flex-col gap-1.5 rounded-md bg-muted p-2">
			<ErrorNote error={runs.error} />
			{runs.isPending && <p className="m-0 p-1 text-xs text-muted-foreground">読み込み中…</p>}
			{runs.data?.length === 0 && (
				<p className="m-0 p-1 text-xs text-muted-foreground">まだ実行されていません</p>
			)}
			{runs.data?.map((r) => (
				<div key={r.id} className="flex flex-col gap-1 rounded-md bg-background px-2.5 py-2">
					<div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
						<Dot tone={RUN_STATUS[r.status].tone}>{RUN_STATUS[r.status].label}</Dot>
						{formatDateTime(r.started_at)}
						{r.finished_at !== null && (
							<span>（{Math.max(1, Math.round(r.finished_at - r.started_at))}秒）</span>
						)}
					</div>
					{r.error ? (
						<p className="m-0 text-xs whitespace-pre-wrap text-destructive">{r.error}</p>
					) : (
						r.reply && <p className="m-0 line-clamp-4 text-xs whitespace-pre-wrap">{r.reply}</p>
					)}
				</div>
			))}
		</div>
	);
}
