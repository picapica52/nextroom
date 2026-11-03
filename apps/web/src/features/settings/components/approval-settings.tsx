import type { ApprovalMode, ApprovalRule } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Trash2 } from "lucide-react";
import { stepLabel } from "@/features/agent/labels";
import { type AgentSettingsForm, useAgentSettingsForm } from "./agent-settings";
import { useChatSettingsForm } from "./chat-settings";
import { ModelChoiceFields } from "./model-choice";
import { Segmented } from "./settings-fields";
import { SettingsBlock, SettingsGroup, SettingsPage, SettingsRow } from "./settings-layout";

const MODES: { value: ApprovalMode; label: string; hint: string }[] = [
	{ value: "ask", label: "確認", hint: "変更を伴う操作の前に毎回確認します" },
	{ value: "auto", label: "自動", hint: "依頼に合わない操作や取り消せない操作だけ確認します" },
	{ value: "never", label: "確認しない", hint: "すべての操作をそのまま実行します" },
];

/** When a character asks before it acts, the model that decides in "auto", and the actions always
 *  allowed or blocked. */
export default function ApprovalSettings() {
	const agent = useAgentSettingsForm();
	const chat = useChatSettingsForm();
	const f = agent.f;
	const approvalModel = chat.f?.form.approval_model ?? null;
	return (
		<SettingsPage
			loadError={(!f && agent.loadError) || (!chat.f && chat.loadError)}
			saveError={agent.saveError ?? chat.saveError}
		>
			{f && chat.f && (
				<>
					<ModeGroup f={f} hasModel={!!approvalModel} />
					{f.form.approvals.mode === "auto" && (
						<SettingsGroup
							id="approval-model"
							title="承認モデル"
							description="「自動」のとき、操作が依頼に合っているかをこのモデルが判断します。速くて安いモデルがおすすめです"
							action={
								approvalModel && (
									<Button
										variant="ghost"
										size="sm"
										onClick={() => chat.f?.set({ approval_model: null })}
									>
										外す
									</Button>
								)
							}
						>
							<SettingsBlock>
								<ModelChoiceFields
									id="approval"
									value={approvalModel}
									onChange={(approval_model) => chat.f?.set({ approval_model })}
								/>
							</SettingsBlock>
						</SettingsGroup>
					)}
					<RulesGroup f={f} />
				</>
			)}
		</SettingsPage>
	);
}

function ModeGroup({ f: { form, set }, hasModel }: { f: AgentSettingsForm; hasModel: boolean }) {
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
			>
				{mode === "auto" && !hasModel && (
					<p className="m-0 text-xs text-warning">下の承認モデルを選ぶまでは「確認」と同じです。</p>
				)}
			</SettingsRow>
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
