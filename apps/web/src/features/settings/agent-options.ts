import type { AgentSettingsView, CLAUDE_MODELS, PermissionMode } from "@nextroom/contracts";

export const PERMISSION_LABELS: Record<PermissionMode, string> = {
	default: "毎回、会話の画面で確認する",
	acceptEdits: "ファイルの編集だけ自動で許可し、ほかは確認する",
	plan: "計画だけ立てて、実行しない",
	dontAsk: "確認せずに断る",
};

/** Claude's tools by what they do, for "確認のしかた"; tools not listed get a row of their own. */
const CLAUDE_TOOL_GROUPS = [
	{ label: "ファイルを読む", tools: ["Read", "Glob", "Grep"] },
	{ label: "ファイルを書く", tools: ["Write", "Edit"] },
	{ label: "作業の計画", tools: ["TodoWrite"] },
	{ label: "Web を調べる", tools: ["WebSearch", "WebFetch"] },
	{ label: "コマンドの実行", tools: ["Bash"] },
];

export function claudeToolGroups(tools: readonly string[]) {
	const groups = CLAUDE_TOOL_GROUPS.map((g) => ({
		...g,
		tools: g.tools.filter((t) => tools.includes(t)),
	})).filter((g) => g.tools.length);
	const grouped = new Set(groups.flatMap((g) => g.tools));
	return [
		...groups,
		...tools.filter((t) => !grouped.has(t)).map((t) => ({ label: t, tools: [t] })),
	];
}

export const CLAUDE_MODEL_LABELS: Record<string, string> = {
	"claude-opus-5-5": "Claude Opus 5.5",
	"claude-sonnet-5-5": "Claude Sonnet 5.5",
	"claude-haiku-4-5": "Claude Haiku 4.5",
} satisfies Record<(typeof CLAUDE_MODELS)[number], string>;

/** Saves a change to some of one section of the agent settings, resolving to whether it was saved. */
export type SetAgentSection = <K extends keyof AgentSettingsView>(
	section: K,
	changes: Partial<AgentSettingsView[K]>,
) => Promise<boolean>;
