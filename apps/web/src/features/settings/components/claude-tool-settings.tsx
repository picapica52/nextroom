import { type AgentSettingsView, CLAUDE_MODELS, PERMISSION_MODES } from "@nextroom/contracts";
import { Field, FieldDescription, FieldLabel } from "@nextroom/ui/components/field";
import { Link } from "react-router-dom";
import { SimpleSelect } from "@/components/simple-select";
import { Dot } from "@/components/status";
import { CLAUDE_MODEL_LABELS, PERMISSION_LABELS, type SetAgentSection } from "../agent-options";
import { NumberField } from "./settings-fields";

export const claudeToolSummary = (claude: AgentSettingsView["claude"]) =>
	`${claude.model ? (CLAUDE_MODEL_LABELS[claude.model] ?? claude.model) : "モデル未設定"} ・ ${
		claude.auth === "api_key" ? "Anthropic API キー" : "Claude Code のログイン"
	}`;

export function ClaudeToolSettings({
	claude,
	hasApiKey,
	set,
}: {
	claude: AgentSettingsView["claude"];
	hasApiKey: boolean;
	set: SetAgentSection;
}) {
	return (
		<>
			<p className="m-0 text-xs text-muted-foreground">
				手間のかかる作業を、キャラクターが Claude Agent SDK に任せます。Docker の中ではなくこの PC
				上で直接動き、キャラクターと同じワークスペースで作業します。
			</p>
			<Field>
				<FieldLabel htmlFor="claude-auth">認証</FieldLabel>
				<SimpleSelect
					id="claude-auth"
					value={claude.auth}
					onChange={(auth) => auth && set("claude", { auth })}
					options={[
						{ value: "api_key", label: "Anthropic API キー（従量課金）" },
						{
							value: "login",
							label: "この PC の Claude Code のログイン（サブスクリプション）",
						},
					]}
				/>
				{claude.auth === "login" ? (
					<FieldDescription>
						Claude Code にログインしているアカウントのサブスクリプションで動きます。先にターミナルで
						claude を起動して /login
						しておいてください。個人で使う場合に限ります（他の人に提供するアプリでは使えません）。
					</FieldDescription>
				) : (
					<FieldDescription className="text-xs">
						{hasApiKey ? (
							<Dot tone="success">Anthropic の API キーは設定済みです</Dot>
						) : (
							<span className="text-warning">Anthropic の API キーが未設定です。</span>
						)}{" "}
						キーは .env の ANTHROPIC_API_KEY で設定します（
						<Link to="/settings/connections">設定 → 接続</Link>
						で確認。返答モデルの Claude と共通）。
					</FieldDescription>
				)}
			</Field>
			<div className="grid grid-cols-2 gap-3">
				<Field>
					<FieldLabel htmlFor="claude-model">モデル</FieldLabel>
					<SimpleSelect
						id="claude-model"
						value={claude.model || null}
						onChange={(model) => model && set("claude", { model })}
						placeholder="モデルを選ぶ"
						options={CLAUDE_MODELS.map((m) => ({
							value: m,
							label: CLAUDE_MODEL_LABELS[m] ?? m,
						}))}
					/>
				</Field>
				<NumberField
					id="turns"
					label="最大ターン数"
					value={claude.max_turns}
					min={1}
					onChange={(max_turns) => set("claude", { max_turns })}
				/>
			</div>
			<Field>
				<FieldLabel htmlFor="perm">自動で許可していないツールの扱い</FieldLabel>
				<SimpleSelect
					id="perm"
					value={claude.permission_mode}
					onChange={(permission_mode) => permission_mode && set("claude", { permission_mode })}
					options={PERMISSION_MODES.filter(
						(m) => m !== "acceptEdits" || m === claude.permission_mode,
					).map((m) => ({ value: m, label: PERMISSION_LABELS[m] }))}
				/>
			</Field>
		</>
	);
}
