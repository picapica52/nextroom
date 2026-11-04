import type { AgentStep, StepKind } from "@nextroom/contracts";
import {
	Globe,
	ImageIcon,
	LayoutGrid,
	type LucideIcon,
	MessageCircleQuestionMark,
	Monitor,
	NotebookPen,
	Sparkles,
	SquareTerminal,
	UserPlus,
	Wrench,
} from "lucide-react";

/** How each kind of tool call is shown: its icon, name and the icon's color. */
export const KINDS: Record<StepKind, { icon: LucideIcon; title: string; tone: string }> = {
	web: { icon: Globe, title: "Web", tone: "text-info" },
	// Older replies: the browser tool, since removed.
	browser: { icon: Globe, title: "ブラウザ", tone: "text-info" },
	desktop: { icon: Monitor, title: "デスクトップ", tone: "text-info" },
	sandbox: { icon: SquareTerminal, title: "コマンド", tone: "text-warning" },
	claude: { icon: Sparkles, title: "Claude Agent SDK", tone: "text-mode-lora" },
	image: { icon: ImageIcon, title: "画像生成", tone: "text-mode-lora" },
	ask: { icon: MessageCircleQuestionMark, title: "質問", tone: "text-mode-si" },
	memory: { icon: NotebookPen, title: "記憶", tone: "text-mode-si" },
	app: { icon: LayoutGrid, title: "アプリ連携", tone: "text-info" },
	character: { icon: UserPlus, title: "キャラクター", tone: "text-mode-si" },
	other: { icon: Wrench, title: "ツール", tone: "text-muted-foreground" },
};

const WORKSPACE_LABELS: Record<string, string> = {
	execute_command: "コマンドを実行",
	get_process_output: "コマンドの出力を見る",
	kill_process: "コマンドを止める",
	read_file: "ファイルを読む",
	write_file: "ファイルを書く",
	edit_file: "ファイルを編集",
	ast_edit: "コードを編集",
	list_files: "ファイルの一覧",
	delete: "ファイルを削除",
	file_stat: "ファイルの情報",
	mkdir: "フォルダーを作る",
	grep: "ファイルを検索",
};

const LABELS: Record<string, string> = {
	web_search: "Web で検索",
	find_topic: "話題をさがす",
	stagehand_navigate: "ページを開く",
	stagehand_act: "ページを操作",
	stagehand_extract: "ページから抜き出す",
	stagehand_observe: "ページを調べる",
	stagehand_tabs: "タブを操作",
	stagehand_screenshot: "スクリーンショット",
	stagehand_close: "ブラウザを閉じる",
	execute_command: "コマンドを実行",
	computer_observe: "画面を見る",
	computer_act: "画面を操作",
	delegate_to_claude: "Claude に任せる",
	send_photo: "写真を送る",
	ask_user: "質問",
	update_memory: "メモを書き直す",
	recall: "思い出す",
	schedule_routine: "ルーティンを作る",
	list_routines: "ルーティンを見る",
	cancel_routine: "ルーティンを取り消す",
	list_characters: "キャラクターの一覧",
	read_character: "キャラクターの設定を見る",
	create_character: "キャラクターを作る",
	update_character: "キャラクターの設定を変える",
	COMPOSIO_SEARCH_TOOLS: "アプリの機能を探す",
	COMPOSIO_GET_TOOL_SCHEMAS: "アプリの使い方を調べる",
	COMPOSIO_MULTI_EXECUTE_TOOL: "アプリを使う",
};

/** A tool call in words, e.g. "コマンドを実行" or "Claude: Bash". */
export function stepLabel(step: Pick<AgentStep, "tool">): string {
	if (step.tool.startsWith("claude:")) return `Claude: ${step.tool.slice("claude:".length)}`;
	const workspace = step.tool.replace(/^(mastra_)?workspace_/, "");
	if (workspace !== step.tool && WORKSPACE_LABELS[workspace]) return WORKSPACE_LABELS[workspace];
	return LABELS[step.tool] ?? step.tool;
}

/** The label without the "Claude: " in front, where Claude's calls are already grouped. */
export const shortStepLabel = (step: Pick<AgentStep, "tool">) =>
	stepLabel(step).replace("Claude: ", "");
