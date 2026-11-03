import type { ApprovalMode, ApprovalRule } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Label } from "@nextroom/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@nextroom/ui/components/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@nextroom/ui/components/toggle-group";
import { Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { SettingsSection } from "@/components/settings-section";
import { EmptyNote } from "@/components/status";
import { stepLabel } from "@/features/agent/labels";
import { useChatSettings } from "@/hooks/queries";
import { type AgentSettingsForm, AgentSettingsPage } from "./agent-settings";

const MODES: { mode: ApprovalMode; label: string; description: string }[] = [
	{
		mode: "ask",
		label: "確認",
		description: "ファイルの書き換えや送信など、変更を伴う操作の前に毎回確認します。",
	},
	{
		mode: "auto",
		label: "自動",
		description:
			"承認モデルが依頼に合う操作をそのまま通し、合わないものや取り消せないものだけ確認します。承認モデルが未設定なら「確認」と同じです。",
	},
	{
		mode: "never",
		label: "確認しない",
		description: "すべての操作をそのまま実行します。",
	},
];

/** When a character asks before it acts, and the actions always allowed or blocked. */
export default function ApprovalSettings() {
	return (
		<AgentSettingsPage>
			{(f) => (
				<>
					<ModeSection f={f} />
					<RulesSection f={f} />
				</>
			)}
		</AgentSettingsPage>
	);
}

function ModeSection({ f: { form, set } }: { f: AgentSettingsForm }) {
	const hasModel = !!useChatSettings().data?.approval_model;
	const mode = form.approvals.mode;
	return (
		<SettingsSection
			title="モード"
			description="キャラクターがブラウザ・ファイルとコマンド・アプリ連携などで何かを変える前に、会話の画面で許可を求めるかどうかです。"
		>
			<RadioGroup
				aria-label="モード"
				value={mode}
				onValueChange={(next) => set("approvals", { mode: next as ApprovalMode })}
				className="gap-3"
			>
				{MODES.map((m) => (
					<div key={m.mode} className="flex items-start gap-3">
						<RadioGroupItem id={`approval-${m.mode}`} value={m.mode} className="mt-0.5" />
						<div className="flex flex-col gap-0.5">
							<Label htmlFor={`approval-${m.mode}`}>{m.label}</Label>
							<p className="m-0 text-xs text-muted-foreground">{m.description}</p>
						</div>
					</div>
				))}
			</RadioGroup>
			{mode === "auto" && !hasModel && (
				<p className="m-0 text-xs text-warning">
					承認モデルが未設定のため、今は「確認」と同じです。
					<Link to="/settings/models" className="text-warning">
						設定 → モデル
					</Link>
					の「承認モデル」で選べます。
				</p>
			)}
		</SettingsSection>
	);
}

/** An action in words; an app's actions (comma-separated slugs) stay as they are. */
const ruleLabel = (tool: string) =>
	tool
		.split(",")
		.map((t) => stepLabel({ tool: t }))
		.join("・");

function RulesSection({ f: { form, set } }: { f: AgentSettingsForm }) {
	const { rules } = form.approvals;
	const save = (next: ApprovalRule[]) => set("approvals", { rules: next });
	return (
		<SettingsSection
			title="許可・ブロック一覧"
			description="ここにある操作は、どのモードでも確認しません。許可は常に実行し、ブロックは実行せずに断ります。会話の確認で「常に許可」を押すと、ここに追加されます。"
			className="gap-0"
		>
			{rules.length === 0 ? (
				<EmptyNote className="py-6">まだありません</EmptyNote>
			) : (
				rules.map((rule, i) => {
					const label = ruleLabel(rule.tool);
					return (
						<div
							key={rule.tool}
							className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-foreground/15 py-2.5 first:pt-0 last:border-b-0 last:pb-0"
						>
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="truncate text-sm">{label}</span>
								{label !== rule.tool && (
									<span className="truncate font-mono text-[11px] text-muted-foreground">
										{rule.tool}
									</span>
								)}
							</span>
							<ToggleGroup
								aria-label={label}
								variant="outline"
								size="sm"
								spacing={0}
								value={[rule.decision]}
								onValueChange={(next) => {
									const decision = next[0] as ApprovalRule["decision"] | undefined;
									if (decision && decision !== rule.decision)
										save(rules.map((r, j) => (j === i ? { ...r, decision } : r)));
								}}
							>
								<ToggleGroupItem value="allow">許可</ToggleGroupItem>
								<ToggleGroupItem value="block">ブロック</ToggleGroupItem>
							</ToggleGroup>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="削除"
								className="text-destructive hover:text-destructive"
								onClick={() => save(rules.filter((_, j) => j !== i))}
							>
								<Trash2 />
							</Button>
						</div>
					);
				})
			)}
		</SettingsSection>
	);
}
