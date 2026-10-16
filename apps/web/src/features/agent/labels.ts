import type { AgentStep, StepKind } from "@nextroom/contracts";
import {
	Globe,
	ImageIcon,
	LayoutGrid,
	type LucideIcon,
	MessageCircleQuestionMark,
	Sparkles,
	SquareTerminal,
	Wrench,
} from "lucide-react";

/** How each kind of tool call is shown: its icon, name and the icon's color. */
export const KINDS: Record<StepKind, { icon: LucideIcon; title: string; tone: string }> = {
	browser: { icon: Globe, title: "ブラウザ", tone: "text-info" },
	sandbox: { icon: SquareTerminal, title: "ファイルとコマンド", tone: "text-warning" },
	claude: { icon: Sparkles, title: "Claude Agent SDK", tone: "text-mode-lora" },
	image: { icon: ImageIcon, title: "画像生成", tone: "text-mode-lora" },
	ask: { icon: MessageCircleQuestionMark, title: "質問", tone: "text-mode-si" },
	app: { icon: LayoutGrid, title: "アプリ連携", tone: "text-info" },
	other: { icon: Wrench, title: "ツール", tone: "text-muted-foreground" },
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
	mastra_workspace_execute_command: "コマンドを実行",
	mastra_workspace_get_process_output: "コマンドの出力を見る",
	mastra_workspace_kill_process: "コマンドを止める",
	mastra_workspace_read_file: "ファイルを読む",
	mastra_workspace_write_file: "ファイルを書く",
	mastra_workspace_edit_file: "ファイルを編集",
	mastra_workspace_ast_edit: "コードを編集",
	mastra_workspace_list_files: "ファイルの一覧",
	mastra_workspace_delete: "ファイルを削除",
	mastra_workspace_file_stat: "ファイルの情報",
	mastra_workspace_mkdir: "フォルダーを作る",
	mastra_workspace_grep: "ファイルを検索",
	delegate_to_claude: "Claude に任せる",
	send_photo: "写真を送る",
	ask_user: "質問",
	recall: "思い出す",
	COMPOSIO_SEARCH_TOOLS: "アプリの機能を探す",
	COMPOSIO_GET_TOOL_SCHEMAS: "アプリの使い方を調べる",
	COMPOSIO_MULTI_EXECUTE_TOOL: "アプリを使う",
};

/** A tool call in words, e.g. "コマンドを実行" or "Claude: Bash". */
export function stepLabel(step: Pick<AgentStep, "tool">): string {
	if (step.tool.startsWith("claude:")) return `Claude: ${step.tool.slice("claude:".length)}`;
	return LABELS[step.tool] ?? step.tool;
}

/** The label without the "Claude: " in front, where Claude's calls are already grouped. */
export const shortStepLabel = (step: Pick<AgentStep, "tool">) =>
	stepLabel(step).replace("Claude: ", "");
