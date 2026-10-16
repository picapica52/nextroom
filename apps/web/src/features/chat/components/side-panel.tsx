import type { AgentStep, ChatMessage } from "@nextroom/contracts";
import { ScrollArea } from "@nextroom/ui/components/scroll-area";
import { cn } from "@nextroom/ui/lib/utils";
import { PanelRightClose } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { useAgentSettings } from "@/features/agent/queries";
import { FileExplorer } from "@/features/workspaces/components/file-explorer";
import { allSteps } from "../conversation";
import { RailButton } from "./pane-rail";

/** A stored tab, checked by useLocalState. */
export const panelTabSchema = z.enum(["log", "files"]);
export type PanelTab = z.infer<typeof panelTabSchema>;

/** Beside the conversation: the log of what was said (when `log` is given) and the files of the
 *  character's workspace, one at a time. `onClose`: the panel can be closed. */
export function SidePanel({
	sessionId,
	messages,
	log,
	tab,
	onTab,
	onClose,
	className,
}: {
	sessionId: string | null;
	messages: ChatMessage[];
	log?: ReactNode;
	tab?: PanelTab;
	onTab?: (tab: PanelTab) => void;
	onClose?: () => void;
	className?: string;
}) {
	const shown = log ? tab : "files";
	return (
		<aside
			aria-label={shown === "log" ? "会話ログ" : "ファイル"}
			className={cn("flex min-h-0 min-w-0 flex-col bg-card", className)}
		>
			<div className="flex h-12 shrink-0 items-center gap-1 border-b-2 pr-2 pl-2.5">
				{log ? (
					<div role="tablist" className="flex flex-1 items-center gap-1">
						<TabButton selected={shown === "log"} onClick={() => onTab?.("log")}>
							会話ログ
						</TabButton>
						<TabButton selected={shown === "files"} onClick={() => onTab?.("files")}>
							ファイル
						</TabButton>
					</div>
				) : (
					<span className="flex-1 pl-1.5 text-sm font-medium">ファイル</span>
				)}
				{onClose && (
					<RailButton label="閉じる" onClick={onClose}>
						<PanelRightClose />
					</RailButton>
				)}
			</div>
			{shown === "log" ? (
				<div className="flex min-h-0 flex-1 flex-col">{log}</div>
			) : (
				<ScrollArea className="min-h-0 flex-1">
					<div className="p-4">
						{!sessionId ? (
							<TabNote>会話を始めると、ここにキャラクターのファイルが出ます。</TabNote>
						) : (
							<FilesTab characterId={sessionId} steps={allSteps(messages)} />
						)}
					</div>
				</ScrollArea>
			)}
		</aside>
	);
}

function TabButton({
	selected,
	onClick,
	children,
}: {
	selected: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			role="tab"
			aria-selected={selected}
			onClick={onClick}
			className={cn(
				"h-8 rounded-full border-2 px-3.5 text-[13px] font-bold transition-colors duration-120 ease-smooth outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
				selected
					? "border-pastel-yellow-edge bg-selected text-foreground"
					: "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}

function TabNote({ children }: { children: ReactNode }) {
	return <p className="m-0 text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

function FilesTab({ characterId, steps }: { characterId: string; steps: AgentStep[] }) {
	const settings = useAgentSettings();
	const on = !!settings.data?.sandbox.enabled || !!settings.data?.claude.enabled;
	// The workspace changes when a step finishes; list it again then.
	const finished = steps.filter((s) => s.finished_at).length;
	return (
		<div className="flex flex-col gap-2">
			{!on && (
				<TabNote>
					ファイルとコマンドの道具も Claude Agent SDK もオフです。上の「道具」か
					<Link to="/settings/tools">設定 → 道具と権限</Link>
					でオンにできます。
				</TabNote>
			)}
			<FileExplorer key={characterId} characterId={characterId} version={finished} />
		</div>
	);
}
