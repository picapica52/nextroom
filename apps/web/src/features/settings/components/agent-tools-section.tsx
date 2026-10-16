import type { AgentSettingsView, DockerStatus } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Label } from "@nextroom/ui/components/label";
import { Switch } from "@nextroom/ui/components/switch";
import { cn } from "@nextroom/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { SettingsSection } from "@/components/settings-section";
import type { SetAgentSection } from "../agent-options";
import { BrowserToolSettings, browserToolSummary } from "./browser-tool-settings";
import { ClaudeToolSettings, claudeToolSummary } from "./claude-tool-settings";
import { ComposioToolSettings, composioToolSummary } from "./composio-tool-settings";
import { ImageGenToolSettings, imageGenToolSummary } from "./image-gen-tool-settings";
import { SandboxToolSettings, sandboxToolSummary } from "./sandbox-tool-settings";

type Tool = "browser" | "sandbox" | "claude" | "image_gen" | "composio";

/** The tools the character may use, each with its settings when opened. */
export function AgentToolsSection({
	form: { web_search, topic_search, browser, sandbox, claude, image_gen, composio, ask_user },
	set,
	docker,
	hasApiKey,
}: {
	form: AgentSettingsView;
	set: SetAgentSection;
	docker: DockerStatus | undefined;
	hasApiKey: boolean;
}) {
	const [open, setOpen] = useState<Tool | null>(null);
	return (
		<SettingsSection
			title="使う道具"
			description="キャラクターが使える道具です。細かい設定は「設定」から開きます。"
			className="gap-0"
		>
			<ToolRow
				id="web_search"
				label="Web 検索"
				summary={
					web_search.has_api_key
						? "Exa で検索して、上位のページの要点を読みます"
						: "Exa の API キーが未設定です（.env の EXA_API_KEY）"
				}
				enabled={web_search.enabled}
				onEnabledChange={(enabled) => set("web_search", { enabled })}
			/>

			<ToolRow
				id="topic_search"
				label="話題さがし"
				summary={
					topic_search.has_api_key
						? "「何か話して」と言われたら、好きなことと新しいことの話題を Exa で探します"
						: "Exa の API キーが未設定です（.env の EXA_API_KEY）"
				}
				enabled={topic_search.enabled}
				onEnabledChange={(enabled) => set("topic_search", { enabled })}
			/>

			<ToolRow
				id="browser"
				label="ブラウザ"
				summary={browserToolSummary(browser)}
				enabled={browser.enabled}
				onEnabledChange={(enabled) => set("browser", { enabled })}
				open={open === "browser"}
				onOpenChange={(o) => setOpen(o ? "browser" : null)}
			>
				<BrowserToolSettings browser={browser} set={set} />
			</ToolRow>

			<ToolRow
				id="sandbox"
				label="ファイルとコマンド"
				summary={sandboxToolSummary(sandbox, docker)}
				enabled={sandbox.enabled}
				onEnabledChange={(enabled) => set("sandbox", { enabled })}
				open={open === "sandbox"}
				onOpenChange={(o) => setOpen(o ? "sandbox" : null)}
			>
				<SandboxToolSettings sandbox={sandbox} docker={docker} set={set} />
			</ToolRow>

			<ToolRow
				id="claude"
				label="Claude に任せる"
				summary={claudeToolSummary(claude)}
				enabled={claude.enabled}
				onEnabledChange={(enabled) => set("claude", { enabled })}
				open={open === "claude"}
				onOpenChange={(o) => setOpen(o ? "claude" : null)}
			>
				<ClaudeToolSettings claude={claude} hasApiKey={hasApiKey} set={set} />
			</ToolRow>

			<ToolRow
				id="image_gen"
				label="画像生成"
				summary={imageGenToolSummary(image_gen)}
				enabled={image_gen.enabled}
				onEnabledChange={(enabled) => set("image_gen", { enabled })}
				open={open === "image_gen"}
				onOpenChange={(o) => setOpen(o ? "image_gen" : null)}
			>
				<ImageGenToolSettings />
			</ToolRow>

			<ToolRow
				id="composio"
				label="アプリ連携"
				summary={composioToolSummary(composio)}
				enabled={composio.enabled}
				onEnabledChange={(enabled) => set("composio", { enabled })}
				open={open === "composio"}
				onOpenChange={(o) => setOpen(o ? "composio" : null)}
			>
				<ComposioToolSettings composio={composio} set={set} />
			</ToolRow>

			<ToolRow
				id="ask_user"
				label="選択肢を出す"
				summary="作業の進め方など、決めてほしいことがあるときに返答の最後に選択肢を出します（選ばずに話しかけても大丈夫です）"
				enabled={ask_user.enabled}
				onEnabledChange={(enabled) => set("ask_user", { enabled })}
			/>
		</SettingsSection>
	);
}

/** One tool: whether it is on, what it is set to, and its settings when opened. */
function ToolRow({
	id,
	label,
	summary,
	enabled,
	onEnabledChange,
	open,
	onOpenChange,
	children,
}: {
	id: string;
	label: string;
	summary: string;
	enabled: boolean;
	onEnabledChange: (enabled: boolean) => void;
	/** Without settings of its own, the tool has no 「設定」 button. */
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	children?: ReactNode;
}) {
	return (
		<div className="flex flex-col border-b border-foreground/15 py-3 first:pt-0 last:border-b-0 last:pb-0">
			<div className="flex items-center gap-3">
				<Switch id={id} checked={enabled} onCheckedChange={onEnabledChange} />
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<Label htmlFor={id} className={cn("font-extrabold", !enabled && "text-muted-foreground")}>
						{label}
					</Label>
					<p className="m-0 truncate text-xs text-muted-foreground">{enabled ? summary : "オフ"}</p>
				</div>
				{children && (
					<Button
						variant="outline"
						size="sm"
						aria-expanded={open}
						aria-controls={`${id}-settings`}
						onClick={() => onOpenChange?.(!open)}
					>
						設定
						<ChevronDown className={cn("transition-transform", open && "rotate-180")} />
					</Button>
				)}
			</div>
			{open && children && (
				<div
					id={`${id}-settings`}
					className="mt-3 flex flex-col gap-4 rounded-lg border-2 bg-muted p-3"
				>
					{children}
				</div>
			)}
		</div>
	);
}
