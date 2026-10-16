import type { ChatSessionSummary } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Input } from "@nextroom/ui/components/input";
import { ScrollArea } from "@nextroom/ui/components/scroll-area";
import { Spinner } from "@nextroom/ui/components/spinner";
import { cn } from "@nextroom/ui/lib/utils";
import { FileUp, PanelLeftClose, Plus, Search, Settings } from "lucide-react";
import { type Ref, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Logo } from "@/components/logo";
import { EmptyNote, ErrorNote } from "@/components/status";
import { SELECTED_ITEM } from "@/components/two-pane";
import { CharacterAvatar } from "@/features/characters/components/character-avatar";
import { useCharacters, useCreateCharacter, useImportArchive } from "@/features/characters/queries";
import { useFilePicker } from "@/hooks/use-file-picker";
import { formatDate } from "@/lib/api";
import { RailButton } from "./pane-rail";

/** Every character, each with its one conversation; the newest talk first. */
export function ConversationList({
	sessions,
	currentId,
	onPick,
	onClose,
	searchRef,
	className,
}: {
	sessions: ChatSessionSummary[];
	currentId: string | null;
	onPick?: () => void;
	onClose: () => void;
	searchRef?: Ref<HTMLInputElement>;
	className?: string;
}) {
	const characters = useCharacters().data ?? [];
	const create = useCreateCharacter();
	const importArchive = useImportArchive();
	const picker = useFilePicker(
		([file]) => {
			if (file) importArchive.mutate(file, { onSuccess: onPick });
		},
		{ accept: ".zip" },
	);
	const [query, setQuery] = useState("");
	const q = query.trim().toLowerCase();
	const shown = sessions.filter((s) => !q || s.character_name.toLowerCase().includes(q));

	return (
		<aside aria-label="話し相手" className={cn("flex min-h-0 flex-col bg-card", className)}>
			<div className="flex h-12 shrink-0 items-center gap-1 border-b-2 pr-2 pl-2.5">
				<div className="min-w-0 flex-1">
					<Logo />
				</div>
				<RailButton label="一覧を閉じる" onClick={onClose}>
					<PanelLeftClose />
				</RailButton>
			</div>
			<div className="px-3 pt-3 pb-1">
				<div className="relative">
					<Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						ref={searchRef}
						type="search"
						aria-label="名前で探す"
						placeholder="名前で探す"
						className="h-8 pl-8"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
				</div>
			</div>
			<div className="px-4 pt-2 text-xs font-bold text-muted-foreground">話し相手</div>
			<ScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col gap-0.5 p-2">
					{shown.length === 0 && (
						<EmptyNote className="py-6">
							{sessions.length ? "見つかりません" : "まだキャラクターがいません"}
						</EmptyNote>
					)}
					{shown.map((s) => {
						const selected = s.id === currentId;
						return (
							<NavLink
								key={s.id}
								to={`/chat/${s.id}`}
								onClick={onPick}
								className={cn(
									"flex items-center gap-2.5 rounded-lg border-2 border-transparent px-2 py-2 text-sm text-foreground no-underline transition-colors duration-120 ease-smooth hover:bg-hover hover:text-foreground active:bg-pressed",
									selected && SELECTED_ITEM,
								)}
							>
								<CharacterAvatar
									character={characters.find((c) => c.id === s.character_id) ?? null}
									className="size-10 shrink-0"
								/>
								<span className="flex min-w-0 flex-1 flex-col gap-0.5">
									<span className="flex items-baseline gap-2">
										<span className="min-w-0 flex-1 truncate font-medium">{s.character_name}</span>
										{s.last_message && (
											<span
												className={cn(
													"shrink-0 text-[11px] font-normal",
													selected ? "text-selected-foreground/80" : "text-muted-foreground",
												)}
											>
												{formatDate(s.last_message.created_at)}
											</span>
										)}
									</span>
									<span
										className={cn(
											"truncate text-xs font-normal",
											selected ? "text-selected-foreground/80" : "text-muted-foreground",
										)}
									>
										{s.last_message?.text ?? "まだ話していません"}
									</span>
								</span>
							</NavLink>
						);
					})}
				</div>
			</ScrollArea>
			<div className="flex flex-col gap-1.5 border-t-2 p-3">
				<ErrorNote error={create.error ?? importArchive.error} />
				<div className="flex gap-1.5">
					<Button
						variant="outline"
						className="flex-1 border-dashed"
						disabled={create.isPending}
						onClick={() => create.mutate(undefined, { onSuccess: onPick })}
					>
						<Plus />
						キャラクターを作る
					</Button>
					<Button
						variant="outline"
						size="icon"
						aria-label="キャラクターをインポート（zip）"
						title="キャラクターをインポート（zip）"
						disabled={importArchive.isPending}
						onClick={picker.open}
					>
						{importArchive.isPending ? <Spinner /> : <FileUp />}
					</Button>
					{picker.input}
				</div>
				<Link
					to="/settings"
					onClick={onPick}
					className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-bold text-foreground no-underline transition-colors duration-120 ease-smooth hover:bg-hover hover:text-foreground active:bg-pressed [&_svg]:size-4"
				>
					<Settings />
					設定
				</Link>
			</div>
		</aside>
	);
}
