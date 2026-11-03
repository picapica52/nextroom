import type {
	ModelChoice,
	RoutineTrigger,
	RoutineTriggerType,
	RoutineView,
} from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@nextroom/ui/components/dialog";
import { Field, FieldDescription, FieldLabel } from "@nextroom/ui/components/field";
import { Input } from "@nextroom/ui/components/input";
import { Textarea } from "@nextroom/ui/components/textarea";
import { type ReactNode, useState } from "react";
import { SimpleSelect } from "@/components/simple-select";
import { ErrorNote } from "@/components/status";
import { useRoutineActions } from "../queries";
import { TRIGGER_LABELS, toLocalInput, WEEKDAYS } from "../routine-schedule";
import { ModelChoiceField } from "./model-choice-field";

/** The form's fields of every trigger type, so switching the type keeps what was typed. */
interface TriggerForm {
	type: RoutineTriggerType;
	at: string;
	minutes: string;
	minute: string;
	time: string;
	weekday: number;
	day: string;
	expression: string;
}

function triggerForm(t: RoutineTrigger | undefined): TriggerForm {
	const inHour = Math.ceil(Date.now() / 1000 / 3600) * 3600;
	const form: TriggerForm = {
		type: "daily",
		at: toLocalInput(inHour),
		minutes: "60",
		minute: "0",
		time: "07:00",
		weekday: 1,
		day: "1",
		expression: "0 7 * * *",
	};
	if (!t) return form;
	const merged: TriggerForm = { ...form, type: t.type };
	if (t.type === "once") merged.at = toLocalInput(t.at);
	if (t.type === "interval") merged.minutes = String(t.minutes);
	if (t.type === "hourly") merged.minute = String(t.minute);
	if ("time" in t) merged.time = t.time;
	if (t.type === "weekly") merged.weekday = t.weekday;
	if (t.type === "monthly") merged.day = String(t.day);
	if (t.type === "cron") merged.expression = t.expression;
	return merged;
}

/** The trigger the form says; the server checks the values. */
function triggerOf(f: TriggerForm): RoutineTrigger {
	switch (f.type) {
		case "once":
			return { type: "once", at: Math.floor(new Date(f.at).getTime() / 1000) };
		case "interval":
			return { type: "interval", minutes: Number(f.minutes) };
		case "hourly":
			return { type: "hourly", minute: Number(f.minute) };
		case "daily":
		case "weekdays":
			return { type: f.type, time: f.time };
		case "weekly":
			return { type: "weekly", time: f.time, weekday: f.weekday };
		case "monthly":
			return { type: "monthly", time: f.time, day: Number(f.day) };
		case "cron":
			return { type: "cron", expression: f.expression };
	}
}

/** Creates a routine, or edits `routine`. */
export function RoutineFormDialog({
	characterId,
	routine,
	open,
	onOpenChange,
}: {
	characterId: string;
	routine?: RoutineView;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto sm:max-w-xl">
				{open && (
					<RoutineForm
						characterId={characterId}
						routine={routine}
						onDone={() => onOpenChange(false)}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

function RoutineForm({
	characterId,
	routine,
	onDone,
}: {
	characterId: string;
	routine?: RoutineView;
	onDone: () => void;
}) {
	const { create, update } = useRoutineActions(characterId);
	const [name, setName] = useState(routine?.name ?? "");
	const [instruction, setInstruction] = useState(routine?.instruction ?? "");
	const [trigger, setTrigger] = useState(() => triggerForm(routine?.trigger));
	const [model, setModel] = useState<ModelChoice | null>(routine?.model ?? null);
	const set = (changes: Partial<TriggerForm>) => setTrigger((t) => ({ ...t, ...changes }));
	const pending = create.isPending || update.isPending;
	const ready = name.trim() && instruction.trim();

	const submit = () => {
		const input = { name, instruction, trigger: triggerOf(trigger), model };
		if (routine) update.mutate({ id: routine.id, patch: input }, { onSuccess: onDone });
		else create.mutate(input, { onSuccess: onDone });
	};

	return (
		<>
			<DialogHeader>
				<DialogTitle>{routine ? "ルーティンを編集" : "ルーティンを作成"}</DialogTitle>
				<DialogDescription>
					決まった時間に、キャラクターが指示を実行します。結果はキャラクターからのメッセージとして会話に残ります。
				</DialogDescription>
			</DialogHeader>

			<Field>
				<FieldLabel htmlFor="routine-name">名前</FieldLabel>
				<Input
					id="routine-name"
					value={name}
					maxLength={80}
					placeholder="例: 朝のニュース"
					onChange={(e) => setName(e.target.value)}
				/>
			</Field>
			<Field>
				<FieldLabel htmlFor="routine-instruction">指示</FieldLabel>
				<Textarea
					id="routine-instruction"
					value={instruction}
					rows={5}
					maxLength={4000}
					placeholder="例: 今日の天気と気になるニュースを調べて、短く教えて"
					onChange={(e) => setInstruction(e.target.value)}
				/>
			</Field>

			<Field>
				<FieldLabel htmlFor="routine-trigger">実行タイミング</FieldLabel>
				<div className="flex flex-wrap items-center gap-2">
					<SimpleSelect<RoutineTriggerType>
						id="routine-trigger"
						className="w-40"
						value={trigger.type}
						onChange={(type) => type && set({ type })}
						options={Object.entries(TRIGGER_LABELS).map(([value, label]) => ({
							value: value as RoutineTriggerType,
							label,
						}))}
					/>
					<TriggerFields form={trigger} set={set} />
				</div>
				<FieldDescription className="text-xs">
					{trigger.type === "interval"
						? "前回の実行から数えます（5 分以上）。"
						: trigger.type === "cron"
							? "「分 時 日 月 曜日」の 5 つで書きます。例: 0 7 * * 1-5（平日 7:00）。"
							: "このPCの時刻で実行します。"}
				</FieldDescription>
			</Field>

			<details className="rounded-lg border-2">
				<summary className="cursor-pointer px-3 py-2 text-sm font-bold select-none">詳細</summary>
				<div className="flex flex-col gap-2 border-t-2 p-3">
					<p className="m-0 text-xs text-muted-foreground">
						このルーティンだけ別のモデル・思考で実行するときに選びます。
					</p>
					<ModelChoiceField
						id="routine-model"
						value={model}
						onChange={setModel}
						fallback="キャラクターのモデル"
					/>
				</div>
			</details>

			<ErrorNote error={create.error ?? update.error} />

			<DialogFooter>
				<Button variant="outline" onClick={onDone}>
					キャンセル
				</Button>
				<Button disabled={!ready || pending} onClick={submit}>
					{routine ? "保存" : "作成"}
				</Button>
			</DialogFooter>
		</>
	);
}

function Unit({ children }: { children: ReactNode }) {
	return <span className="text-sm text-muted-foreground">{children}</span>;
}

function TriggerFields({
	form,
	set,
}: {
	form: TriggerForm;
	set: (changes: Partial<TriggerForm>) => void;
}) {
	const time = (
		<Input
			type="time"
			aria-label="時刻"
			className="w-32"
			value={form.time}
			onChange={(e) => set({ time: e.target.value })}
		/>
	);
	switch (form.type) {
		case "once":
			return (
				<Input
					type="datetime-local"
					aria-label="日時"
					className="w-56"
					value={form.at}
					onChange={(e) => set({ at: e.target.value })}
				/>
			);
		case "interval":
			return (
				<>
					<Input
						type="number"
						aria-label="間隔（分）"
						className="w-24"
						min={5}
						value={form.minutes}
						onChange={(e) => set({ minutes: e.target.value })}
					/>
					<Unit>分ごと</Unit>
				</>
			);
		case "hourly":
			return (
				<>
					<Unit>毎時</Unit>
					<Input
						type="number"
						aria-label="分"
						className="w-20"
						min={0}
						max={59}
						value={form.minute}
						onChange={(e) => set({ minute: e.target.value })}
					/>
					<Unit>分</Unit>
				</>
			);
		case "daily":
		case "weekdays":
			return time;
		case "weekly":
			return (
				<>
					<SimpleSelect<string>
						className="w-24"
						value={String(form.weekday)}
						onChange={(v) => v && set({ weekday: Number(v) })}
						options={WEEKDAYS.map((w, i) => ({ value: String(i), label: `${w}曜` }))}
					/>
					{time}
				</>
			);
		case "monthly":
			return (
				<>
					<Input
						type="number"
						aria-label="日"
						className="w-20"
						min={1}
						max={31}
						value={form.day}
						onChange={(e) => set({ day: e.target.value })}
					/>
					<Unit>日</Unit>
					{time}
				</>
			);
		case "cron":
			return (
				<Input
					aria-label="cron 式"
					className="w-48 font-mono"
					value={form.expression}
					onChange={(e) => set({ expression: e.target.value })}
				/>
			);
	}
}
