import type { AgentSettingsPatch, AgentSettingsView } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Label } from "@nextroom/ui/components/label";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@nextroom/ui/components/popover";
import { Separator } from "@nextroom/ui/components/separator";
import { Switch } from "@nextroom/ui/components/switch";
import { ChevronDown, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { ErrorNote } from "@/components/status";
import { useAgentSettings, useSaveAgentSettings } from "@/features/agent/queries";

const TOOLS: {
	key: string;
	label: string;
	description: string;
	on: (s: AgentSettingsView) => boolean;
	patch: (on: boolean) => AgentSettingsPatch;
}[] = [
	{
		key: "web_search",
		label: "Web 検索",
		description: "Exa で Web を検索する",
		on: (s) => s.web_search.enabled,
		patch: (enabled) => ({ web_search: { enabled } }),
	},
	{
		key: "topic_search",
		label: "話題さがし",
		description: "「何か話して」と言われたら話題を探してくる",
		on: (s) => s.topic_search.enabled,
		patch: (enabled) => ({ topic_search: { enabled } }),
	},
	{
		key: "browser",
		label: "ブラウザ",
		description: "Web ページを開いて調べる・操作する",
		on: (s) => s.browser.enabled,
		patch: (enabled) => ({ browser: { enabled } }),
	},
	{
		key: "sandbox",
		label: "ファイルとコマンド",
		description: "ワークスペースでファイル作成・コマンド実行",
		on: (s) => s.sandbox.enabled,
		patch: (enabled) => ({ sandbox: { enabled } }),
	},
	{
		key: "claude",
		label: "Claude Agent SDK",
		description: "手間のかかる作業を Claude に任せる",
		on: (s) => s.claude.enabled,
		patch: (enabled) => ({ claude: { enabled } }),
	},
	{
		key: "ask_user",
		label: "選択肢を出す",
		description: "決めてほしいことがあるとき、返答の最後に選択肢を出す",
		on: (s) => s.ask_user.enabled,
		patch: (enabled) => ({ ask_user: { enabled } }),
	},
];

/** The agent's tools as switches, with the count of those turned on. */
function useToolCount() {
	const settings = useAgentSettings().data;
	return { count: settings ? TOOLS.filter((t) => t.on(settings)).length : 0, total: TOOLS.length };
}

/** The switches for the agent's tools. They are app-wide settings, which the panel says. */
function ToolsPanel() {
	const settings = useAgentSettings().data;
	const save = useSaveAgentSettings();
	return (
		<>
			<PopoverHeader>
				<PopoverTitle>キャラクターが使える道具</PopoverTitle>
				<PopoverDescription className="text-xs">すべての会話に適用されます。</PopoverDescription>
			</PopoverHeader>
			<div className="flex flex-col gap-3">
				{TOOLS.map((tool) => (
					<div key={tool.key} className="flex items-start justify-between gap-3">
						<Label htmlFor={`tool-${tool.key}`} className="flex flex-col items-start gap-0.5">
							<span>{tool.label}</span>
							<span className="text-xs font-normal text-muted-foreground">{tool.description}</span>
						</Label>
						<Switch
							id={`tool-${tool.key}`}
							checked={!!settings && tool.on(settings)}
							disabled={!settings || save.isPending}
							onCheckedChange={(on) => save.mutate(tool.patch(on))}
						/>
					</div>
				))}
			</div>
			<ErrorNote error={save.error} />
			<Separator />
			<Link to="/settings/tools" className="text-xs">
				確認の要否など、詳しい設定 →
			</Link>
		</>
	);
}

/** The toolbar button that opens the tool switches. */
export function ToolsPopover() {
	const { count, total } = useToolCount();
	return (
		<Popover>
			<PopoverTrigger render={<Button variant="outline" size="sm" />}>
				<Wrench />
				<span className="hidden sm:inline">道具</span>
				<span className="font-mono text-xs text-muted-foreground">
					{count}/{total}
				</span>
				<ChevronDown className="text-muted-foreground" />
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80">
				<ToolsPanel />
			</PopoverContent>
		</Popover>
	);
}
