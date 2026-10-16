import { type AgentSettingsView, CLAUDE_TOOLS } from "@nextroom/contracts";
import { ToggleGroup, ToggleGroupItem } from "@nextroom/ui/components/toggle-group";
import { cn } from "@nextroom/ui/lib/utils";
import type { ReactNode } from "react";
import { SettingsSection } from "@/components/settings-section";
import { claudeToolGroups, type SetAgentSection } from "../agent-options";

/** Whether each tool asks on the conversation screen before it acts. */
export function AgentApprovalsSection({
	form: { browser, sandbox, claude, image_gen, composio },
	set,
}: {
	form: AgentSettingsView;
	set: SetAgentSection;
}) {
	return (
		<SettingsSection
			title="確認のしかた"
			description="キャラクターが実行する前に、会話の画面で許可を求めるかどうか。すべての道具をここで決めます。"
			className="gap-4"
		>
			<ApproveGroup title="ブラウザ" off={!browser.enabled}>
				<ApproveRow
					label="ページを開く"
					ask={browser.approve_navigate}
					onChange={(approve_navigate) => set("browser", { approve_navigate })}
				/>
				<ApproveRow
					label="クリック・入力などの操作"
					ask={browser.approve_act}
					onChange={(approve_act) => set("browser", { approve_act })}
				/>
			</ApproveGroup>
			<ApproveGroup title="ファイルとコマンド" off={!sandbox.enabled}>
				<ApproveRow
					label="コマンドの実行"
					ask={sandbox.approve_command}
					onChange={(approve_command) => set("sandbox", { approve_command })}
				/>
				<ApproveRow
					label="ファイルの書き込み・編集"
					ask={sandbox.approve_write}
					onChange={(approve_write) => set("sandbox", { approve_write })}
				/>
				<ApproveRow
					label="ファイルの削除"
					ask={sandbox.approve_delete}
					onChange={(approve_delete) => set("sandbox", { approve_delete })}
				/>
			</ApproveGroup>
			<ApproveGroup title="画像生成" off={!image_gen.enabled}>
				<ApproveRow
					label="写真を送る"
					ask={image_gen.approve}
					onChange={(approve) => set("image_gen", { approve })}
				/>
			</ApproveGroup>
			<ApproveGroup title="アプリ連携" off={!composio.enabled}>
				<ApproveRow
					label="読む・調べる"
					detail="メールや予定を見る など"
					ask={composio.approve_read}
					onChange={(approve_read) => set("composio", { approve_read })}
				/>
				<ApproveRow
					label="送る・作る・変える・消す"
					detail="メールを送る、予定を入れる など"
					ask={composio.approve_write}
					onChange={(approve_write) => set("composio", { approve_write })}
				/>
			</ApproveGroup>
			<ApproveGroup title="Claude" off={!claude.enabled}>
				{claudeToolGroups(CLAUDE_TOOLS).map((group) => (
					<ApproveRow
						key={group.label}
						label={group.label}
						detail={group.tools.join("・")}
						askLabel={claude.permission_mode === "dontAsk" ? "断る" : "毎回確認"}
						ask={!group.tools.every((t) => claude.allowed_tools.includes(t))}
						onChange={(ask) =>
							set("claude", {
								allowed_tools: ask
									? claude.allowed_tools.filter((t) => !group.tools.includes(t))
									: [...new Set([...claude.allowed_tools, ...group.tools])],
							})
						}
					/>
				))}
			</ApproveGroup>
		</SettingsSection>
	);
}

/** The approvals of one tool, faded while it is off. */
function ApproveGroup({
	title,
	off,
	children,
}: {
	title: string;
	off: boolean;
	children: ReactNode;
}) {
	return (
		<div className={cn("flex flex-col", off && "opacity-50")}>
			<div className="text-xs font-extrabold text-muted-foreground">
				{title}
				{off && "（オフ）"}
			</div>
			{children}
		</div>
	);
}

/** Whether an action asks on the conversation screen first, or runs right away. */
function ApproveRow({
	label,
	detail,
	ask,
	askLabel = "毎回確認",
	onChange,
}: {
	label: string;
	detail?: string;
	ask: boolean;
	askLabel?: string;
	onChange: (ask: boolean) => void;
}) {
	return (
		<div className="flex items-center gap-3 border-t border-foreground/15 py-2 first-of-type:border-t-0">
			<span className="min-w-0 flex-1 text-sm">
				{label}
				{detail && <span className="ml-2 font-mono text-xs text-muted-foreground">{detail}</span>}
			</span>
			<ToggleGroup
				aria-label={label}
				variant="outline"
				size="sm"
				spacing={0}
				value={[ask ? "ask" : "auto"]}
				onValueChange={(next) => next[0] && onChange(next[0] === "ask")}
			>
				<ToggleGroupItem value="ask">{askLabel}</ToggleGroupItem>
				<ToggleGroupItem value="auto">自動で許可</ToggleGroupItem>
			</ToggleGroup>
		</div>
	);
}
