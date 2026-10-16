import type { CharacterView } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Globe, PanelLeft, PanelRight, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AffinityBadge } from "@/features/characters/components/affinity";
import { CharacterAvatar } from "@/features/characters/components/character-avatar";
import { PaneToggle } from "./pane-rail";
import { ToolsPopover } from "./tools-popover";

/** The conversation's partner and how long the two have talked, with the tools, browser and
 *  the character's settings. */
export function ChatPageHeader({
	wide,
	currentId,
	character,
	name,
	subtitle,
	listOpen,
	onListOpen,
	panelOpen,
	onPanelOpen,
	onBrowser,
}: {
	wide: boolean;
	currentId: string | null;
	character: CharacterView | undefined;
	name: string;
	subtitle: string;
	listOpen: boolean;
	onListOpen: (open: boolean) => void;
	panelOpen: boolean;
	onPanelOpen: (open: boolean) => void;
	onBrowser: () => void;
}) {
	const navigate = useNavigate();
	return (
		<header className="flex min-h-14 items-center gap-2 border-b-2 px-3 py-2 sm:px-4">
			{!wide && (
				<PaneToggle label="話し相手" pressed={listOpen} onPressedChange={onListOpen}>
					<PanelLeft />
				</PaneToggle>
			)}
			<CharacterAvatar character={character} className="size-9" />
			<div className="min-w-0 flex-1">
				<div className="flex min-w-0 items-center gap-2">
					<div className="truncate font-medium">{currentId ? name : "話し相手"}</div>
					{currentId && <AffinityBadge characterId={character?.id ?? null} />}
				</div>
				<div className="truncate text-xs text-muted-foreground">{subtitle}</div>
			</div>
			<div className="flex items-center gap-1">
				<ToolsPopover />
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label="ブラウザを開く"
					title="ブラウザを開く"
					disabled={!currentId}
					onClick={onBrowser}
				>
					<Globe />
				</Button>
				{!wide && (
					<PaneToggle label="ファイル" pressed={panelOpen} onPressedChange={onPanelOpen}>
						<PanelRight />
					</PaneToggle>
				)}
				{character && (
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="キャラクターの設定"
						title="キャラクターの設定"
						onClick={() => navigate(`/characters/${character.id}`)}
					>
						<Pencil />
					</Button>
				)}
			</div>
		</header>
	);
}
