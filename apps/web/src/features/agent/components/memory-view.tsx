import { Button } from "@nextroom/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@nextroom/ui/components/card";
import { Trash2 } from "lucide-react";
import { useConfirm } from "@/components/confirm";
import { EmptyNote, ErrorNote } from "@/components/status";
import { useCharacters } from "@/features/characters/queries";
import { useMemoryActions, useMemoryOverview } from "../queries";

/** What a character remembers: its notes about the user, as the observer keeps them. */
export function MemoryView({ characterId }: { characterId: string }) {
	const confirm = useConfirm();
	const characters = useCharacters();
	const overview = useMemoryOverview(characterId);
	const { clear } = useMemoryActions(characterId);

	const data = overview.data;
	const name = characters.data?.find((c) => c.id === characterId)?.name ?? "";

	return (
		<>
			<div className="flex flex-wrap items-center gap-2">
				<p className="m-0 min-w-0 flex-1 text-sm text-muted-foreground">
					{name} が覚えていること。会話の中で自動で更新されます。
				</p>
				<Button
					variant="ghost"
					size="sm"
					className="text-destructive"
					disabled={clear.isPending}
					onClick={async () => {
						if (
							await confirm({
								title: `${name} の記憶を消しますか？`,
								description:
									"ワーキングメモリーと、これまでの会話がすべて消えます。好感度も最初に戻ります。",
								action: "消去",
								destructive: true,
							})
						)
							clear.mutate();
					}}
				>
					<Trash2 />
					記憶を消去
				</Button>
			</div>
			<ErrorNote error={clear.error ?? overview.error} />

			<div className="flex flex-col gap-4">
				<Card>
					<CardHeader>
						<CardTitle>ワーキングメモリー</CardTitle>
						<CardDescription className="text-xs">
							あなたについてのメモ。会話が要約されるときに書き換わり、毎回の返答で参照されます。
						</CardDescription>
					</CardHeader>
					<CardContent>
						{data?.working_memory ? (
							<pre className="m-0 max-h-80 overflow-y-auto rounded-lg border-2 bg-muted px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap">
								{data.working_memory}
							</pre>
						) : (
							<EmptyNote className="py-4">
								まだメモはありません。会話がある程度たまると書かれます。
							</EmptyNote>
						)}
					</CardContent>
				</Card>
			</div>
		</>
	);
}
