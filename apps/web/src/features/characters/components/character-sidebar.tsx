import type { CharacterView } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Download, Trash2 } from "lucide-react";
import { useConfirm } from "@/components/confirm";
import { MoreMenu } from "@/components/more-menu";
import { RouteDialogNav } from "@/components/route-dialog";
import { ErrorNote } from "@/components/status";
import { SideNavItem } from "@/components/two-pane";
import { formatDate } from "@/lib/api";
import { TAB_INFO, TABS, type Tab } from "../tabs";
import { AvatarMenu } from "./character-avatar-menu";

/** The character's picture and name, the list of its tabs, and exporting or deleting it. */
export function CharacterSidebar({
	characterId,
	character,
	tab,
	messageCount,
	onChange,
	onExport,
	onRemove,
	removeError,
}: {
	characterId: string;
	character: CharacterView;
	tab: Tab;
	messageCount: number;
	onChange: (c: CharacterView) => void;
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
			<div className="flex shrink-0 items-center gap-3 px-3 pt-3 md:px-4 md:pt-5 md:pb-2">
				<AvatarMenu character={character} onChange={onChange} />
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<div className="truncate text-base font-extrabold">{character.persona.name}</div>
					<div className="truncate text-xs text-muted-foreground">
						やりとり {messageCount} 件 ・ 更新 {formatDate(character.updated_at)}
					</div>
				</div>
				<div className="md:hidden">
					<MoreMenu
						items={[
							{ label: "エクスポート", onClick: onExport },
							{ label: "キャラクターを削除", danger: true, onClick: () => void remove() },
						]}
					/>
				</div>
			</div>
			<div className="px-3 md:hidden">
				<ErrorNote error={removeError} />
			</div>

			<nav
				aria-label="キャラクターの項目"
				className="flex gap-1 overflow-x-auto p-1.5 md:min-h-0 md:flex-1 md:flex-col md:overflow-x-visible md:overflow-y-auto md:p-2"
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

			<div className="hidden shrink-0 flex-col gap-0.5 p-2 md:flex">
				<ErrorNote error={removeError} />
				<Button variant="ghost" className="justify-start" onClick={onExport}>
					<Download />
					エクスポート
				</Button>
				<Button
					variant="ghost"
					className="justify-start text-destructive hover:text-destructive"
					onClick={() => void remove()}
				>
					<Trash2 />
					削除
				</Button>
			</div>
		</RouteDialogNav>
	);
}
