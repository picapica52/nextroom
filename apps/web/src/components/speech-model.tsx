import type { SpeechModel } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Download, X } from "lucide-react";
import { Link } from "react-router-dom";
import { SimpleSelect } from "@/components/simple-select";
import { Dot, ErrorNote, Meter } from "@/components/status";
import { useChatSettings, useSpeechModelAction, useSpeechModels, useStatus } from "@/hooks/queries";
import { formatBytes } from "@/lib/api";

type Task = "tts" | "asr";

const WHAT: Record<Task, string> = { tts: "音声合成", asr: "文字起こし" };

/** The model the speech.cpp server holds for `task`, and whether it can be used: transcription
 *  also can with a model chosen in the settings, which it loads first. */
export function useSpeechModel(task: Task) {
	const speech = useStatus().data?.speech;
	const chosen = useChatSettings().data?.asr_model;
	const model = speech?.ok ? speech[task] : null;
	return { speech, model, ready: !!model || (task === "asr" && !!speech?.ok && !!chosen) };
}

/** What the speech.cpp server holds for `task`, or why it cannot be used. */
export function SpeechModelNote({ task }: { task: Task }) {
	const { speech, model } = useSpeechModel(task);
	if (!speech) return <Dot tone="muted">speech.cpp を確認中</Dot>;
	return (
		<span className="flex flex-col items-start gap-1">
			{!speech.ok ? (
				<Dot tone="destructive">speech.cpp サーバーに接続できません</Dot>
			) : model ? (
				<Dot tone="success">{model}</Dot>
			) : (
				<Dot tone="warning">speech.cpp サーバーに{WHAT[task]}のモデルがありません</Dot>
			)}
			<span className="text-xs text-muted-foreground">
				別に起動した speech.cpp サーバー（<span className="font-mono">{speech.url}</span>
				）のモデルを使います。モデルは<Link to="/settings/models">「モデル」</Link>
				で選び、接続先は .env の SPEECH_URL で設定します。
			</span>
		</span>
	);
}

const SERVER_TASK: Record<Task, SpeechModel["task"]> = { tts: "synthesis", asr: "recognition" };

const NOTES: Record<Task, { unfetched: string; about: string }> = {
	tts: {
		unfetched: "ダウンロードするまで、このキャラクターは話せません。",
		about:
			"speech.cpp サーバーのカタログにある Irodori-TTS のモデルから選びます。サーバーが読み込めるモデルは1つだけで、違うモデルのキャラクターが話すときは、先にモデルを読み込み直します。",
	},
	asr: {
		unfetched: "ダウンロードするまで文字起こしできません。",
		about:
			"speech.cpp サーバーのカタログにある、日本語を書ける文字起こしのモデルから選びます。選んだモデルは文字起こしの前にサーバーへ読み込みます。未選択のときは、サーバーが読み込んでいるモデルを使います。",
	},
};

/** A model of the speech.cpp server's catalog for `task`, with its download below. The server
 *  holds one model of each task and is switched to the chosen one before it is used. */
export function SpeechModelPicker({
	task,
	id,
	value,
	onChange,
}: {
	task: Task;
	id?: string;
	value: string;
	onChange: (model: string) => void;
}) {
	const { data, error } = useSpeechModels();
	if (!data)
		return error ? <ErrorNote error={error} /> : <Dot tone="muted">speech.cpp を確認中</Dot>;
	if (!data.ok)
		return (
			<span className="flex flex-col items-start gap-1">
				<Dot tone="destructive">speech.cpp サーバーに接続できません</Dot>
				<span className="text-xs text-muted-foreground">
					サーバーの起動方法と本体のダウンロードは<Link to="/settings/connections">「接続」</Link>
					にあります。モデルは、サーバーに接続できると選べます。
				</span>
			</span>
		);
	const models = data.models.filter((m) => m.task === SERVER_TASK[task]);
	const chosen = models.find((m) => m.name === value);
	return (
		<div className="flex flex-col gap-2">
			<SimpleSelect
				id={id}
				value={value || null}
				onChange={(model) => model && onChange(model)}
				placeholder="モデルを選ぶ"
				className="max-w-md"
				options={models.map((m) => ({
					value: m.name,
					label: (
						<span className="flex items-baseline gap-2">
							<span>{m.label}</span>
							{m.recommended && <span className="text-xs text-success">おすすめ</span>}
							<span className="text-xs text-muted-foreground">
								{formatBytes(m.size)}
								{m.fetched && "・ダウンロード済み"}
							</span>
						</span>
					),
				}))}
			/>
			{value && !chosen && (
				<span className="text-xs text-warning">
					選んだモデル（<span className="font-mono">{value}</span>
					）は speech.cpp サーバーのカタログにありません
				</span>
			)}
			{chosen && (
				<div className="max-w-md rounded-lg border">
					<ModelRow m={chosen} />
				</div>
			)}
			{chosen && !chosen.fetched && !chosen.loading && (
				<span className="text-xs text-warning">
					選んだモデルはまだダウンロードされていません。{NOTES[task].unfetched}
				</span>
			)}
			<span className="text-xs text-muted-foreground">{NOTES[task].about}</span>
		</div>
	);
}

function ModelRow({ m }: { m: SpeechModel }) {
	const action = useSpeechModelAction(m.name);
	return (
		<div className="flex flex-col gap-2.5 px-4 py-3.5">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
				<span className="flex min-w-0 flex-[1_1_240px] flex-col gap-0.5">
					<span className="font-medium">{m.label}</span>
					<span className="text-xs text-muted-foreground">
						{formatBytes(m.size)}・{m.description}
					</span>
				</span>
				{m.loading ? (
					<Button
						variant="outline"
						size="sm"
						disabled={m.loading === "loading"}
						onClick={() => action.mutate("cancel")}
					>
						<X />
						中止
					</Button>
				) : m.fetched ? (
					<Dot tone="success">ダウンロード済み</Dot>
				) : (
					<Button size="sm" disabled={action.isPending} onClick={() => action.mutate("load")}>
						<Download />
						{m.fetched_bytes ? "続きをダウンロード" : "ダウンロード"}
					</Button>
				)}
			</div>
			{m.loading === "fetching" && (
				<div className="flex items-center gap-2.5">
					<div className="flex-1">
						<Meter value={m.size ? m.fetched_bytes / m.size : 0} tone="running" />
					</div>
					<span className="font-mono text-xs text-foreground/80">
						{formatBytes(m.fetched_bytes)} / {formatBytes(m.size)}
					</span>
				</div>
			)}
			{m.loading === "loading" && <Dot tone="info">サーバーで読み込み中</Dot>}
			<ErrorNote error={m.error ?? action.error} />
		</div>
	);
}
