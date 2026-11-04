import type { CharacterView } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Download, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/confirm";
import { RouteDialogClose, RouteDialogNav } from "@/components/route-dialog";
import { ErrorNote } from "@/components/status";
import { SideNavItem } from "@/components/two-pane";
import { formatDate } from "@/lib/api";
import { TAB_INFO, TABS, type Tab } from "../tabs";
import { AvatarMenu } from "./character-avatar-menu";

/** The character's picture and name, the list of its tabs, and exporting or deleting it (the
 *  game master cannot be deleted). */
export function CharacterSidebar({
	characterId,
	character,
	tab,
	messageCount,
	onChange,
	onClose,
	onExport,
	onRemove,
	removeError,
}: {
	characterId: string;
	character: CharacterView;
	/** The open tab; null when none is open (the list alone on a narrow screen). */
	tab: Tab | null;
	messageCount: number;
	onChange: (c: CharacterView) => void;
	/** Closes the dialog; shown only on a narrow screen, where the list fills it. */
	onClose: () => void;
	onExport: () => void;
	/** Deletes the character once the user has confirmed it. */
	onRemove: () => void;
	removeError: unknown;
}) {
	const confirm = useConfirm();
	const remove = async () => {
		const ok = await confirm({
			title: `「${character.persona.name}」を削除しますか？`,
			description:
				"このキャラクターとの会話は残りますが、続きを話すことはできなくなります。参照音声やボイスファイルも削除されます。",
			action: "削除",
			destructive: true,
		});
		if (ok) onRemove();
	};
	return (
		<RouteDialogNav label={character.persona.name}>
			<div className="flex shrink-0 items-center gap-3 px-3 pt-3 pb-2 md:px-4 md:pt-5">
				<AvatarMenu character={character} onChange={onChange} />
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<div className="truncate text-base font-extrabold">{character.persona.name}</div>
					<div className="truncate text-xs text-muted-foreground">
						やりとり {messageCount} 件 ・ 更新 {formatDate(character.updated_at)}
					</div>
				</div>
				<div className="self-start md:hidden">
					<RouteDialogClose onClose={onClose} />
				</div>
			</div>

			<nav
				aria-label="キャラクターの項目"
				className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2"
			>
				{TABS.map((t) => (
					<SideNavItem
						key={t.id}
						to={`/characters/${characterId}/${t.id}`}
						active={t.id === tab}
						label={t.label}
						summary={TAB_INFO[t.id].summary}
					/>
				))}
			</nav>

			<div className="flex shrink-0 flex-col gap-0.5 border-t-2 p-2 md:border-t-0">
				<ErrorNote error={removeError} />
				<Button variant="ghost" className="justify-start" onClick={onExport}>
					<Download />
					エクスポート
				</Button>
				{!character.game_master && (
					<Button
						variant="ghost"
						className="justify-start text-destructive hover:text-destructive"
						onClick={() => void remove()}
					>
						<Trash2 />
						削除
					</Button>
				)}
			</div>
		</RouteDialogNav>
	);
}
