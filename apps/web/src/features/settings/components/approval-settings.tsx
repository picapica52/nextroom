import type { ApprovalMode, ApprovalRule } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Trash2 } from "lucide-react";
import { stepLabel } from "@/features/agent/labels";
import { type AgentSettingsForm, AgentSettingsPage } from "./agent-settings";
import { Segmented } from "./settings-fields";
import { SettingsGroup, SettingsRow } from "./settings-layout";

const MODES: { value: ApprovalMode; label: string; hint: string }[] = [
	{ value: "ask", label: "確認", hint: "変更を伴う操作の前に毎回確認します" },
	{ value: "never", label: "確認しない", hint: "すべての操作をそのまま実行します" },
];

/** When a character asks before it acts, and the actions always allowed or blocked. */
export default function ApprovalSettings() {
	return (
		<AgentSettingsPage>
			{(f) => (
				<>
					<ModeGroup f={f} />
					<RulesGroup f={f} />
				</>
			)}
		</AgentSettingsPage>
	);
}

function ModeGroup({ f: { form, set } }: { f: AgentSettingsForm }) {
	const mode = form.approvals.mode;
	return (
		<SettingsGroup>
			<SettingsRow
				id="approval-mode"
				label="操作の前に確認"
				hint={MODES.find((m) => m.value === mode)?.hint}
				control={
					<Segmented
						label="操作の前に確認"
						options={MODES}
						value={mode}
						onChange={(next) => set("approvals", { mode: next })}
					/>
				}
			/>
		</SettingsGroup>
	);
}

/** An action in words; an app's actions (comma-separated slugs) stay as they are. */
const ruleLabel = (tool: string) =>
	tool
		.split(",")
		.map((t) => stepLabel({ tool: t }))
		.join("・");

/** The actions allowed or blocked from the conversation's "always allow"; shown once there are any. */
function RulesGroup({ f: { form, set } }: { f: AgentSettingsForm }) {
	const { rules } = form.approvals;
	if (!rules.length) return null;
	const save = (next: ApprovalRule[]) => set("approvals", { rules: next });
	return (
		<SettingsGroup
			id="approval-rules"
			title="許可・ブロック"
			description="会話中に「常に許可」などを選んだ操作です"
		>
			{rules.map((rule, i) => (
				<SettingsRow
					key={rule.tool}
					label={ruleLabel(rule.tool)}
					control={
						<>
							<Segmented
								label={ruleLabel(rule.tool)}
								options={[
									{ value: "allow", label: "許可" },
									{ value: "block", label: "ブロック" },
								]}
								value={rule.decision}
								onChange={(decision) =>
									save(rules.map((r, j) => (j === i ? { ...r, decision } : r)))
								}
							/>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="削除"
								className="text-destructive hover:text-destructive"
								onClick={() => save(rules.filter((_, j) => j !== i))}
							>
								<Trash2 />
							</Button>
						</>
					}
				/>
			))}
		</SettingsGroup>
	);
}
