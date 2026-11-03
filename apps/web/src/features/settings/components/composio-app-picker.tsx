import type { ComposioApp } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@nextroom/ui/components/dialog";
import { Input } from "@nextroom/ui/components/input";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Dot, ErrorNote } from "@/components/status";
import { useComposioCatalog } from "@/features/agent/queries";

const SHOWN = 100;

const matches = (app: ComposioApp, words: string[]) => {
	const text = `${app.name} ${app.slug}`.toLowerCase();
	return words.every((w) => text.includes(w));
};

/** Every app of Composio, searched by name; picking one adds it to the apps the character uses. */
export function ComposioAppPicker({
	open,
	onOpenChange,
	added,
	onAdd,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	added: string[];
	onAdd: (slug: string) => void;
}) {
	const catalog = useComposioCatalog(open);
	const [query, setQuery] = useState("");
	const found = useMemo(() => {
		const words = query.toLowerCase().split(/\s+/).filter(Boolean);
		return (catalog.data?.apps ?? []).filter((app) => matches(app, words));
	}, [catalog.data, query]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="gap-4 sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>アプリを追加</DialogTitle>
					<DialogDescription>Composio でつなげるアプリから選びます。</DialogDescription>
				</DialogHeader>
				<div className="relative">
					<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						autoFocus
						className="pl-9"
						value={query}
						placeholder="アプリの名前で探す"
						onChange={(e) => setQuery(e.target.value)}
					/>
				</div>
				<div className="-mx-1 h-[min(60vh,28rem)] overflow-y-auto px-1">
					{catalog.isPending ? (
						<p className="py-6 text-center text-sm text-muted-foreground">読み込み中…</p>
					) : found.length === 0 ? (
						<p className="py-6 text-center text-sm text-muted-foreground">
							{catalog.data?.error ? "" : "見つかりません"}
						</p>
					) : (
						<div className="flex flex-col divide-y divide-foreground/15">
							{found.slice(0, SHOWN).map((app) => (
								<div key={app.slug} className="flex items-center gap-3 py-2">
									{app.logo ? (
										<img src={app.logo} alt="" loading="lazy" className="size-6 shrink-0" />
									) : (
										<span className="size-6 shrink-0" />
									)}
									<div className="min-w-0 flex-1">
										<div className="truncate text-sm font-bold">{app.name}</div>
										<div className="truncate font-mono text-xs text-muted-foreground">
											{app.slug}
										</div>
									</div>
									{added.includes(app.slug) ? (
										<Dot tone="success">追加済み</Dot>
									) : (
										<Button variant="outline" size="sm" onClick={() => onAdd(app.slug)}>
											追加
										</Button>
									)}
								</div>
							))}
							{found.length > SHOWN && (
								<p className="py-3 text-center text-xs text-muted-foreground">
									ほかに {found.length - SHOWN} 件あります。名前で絞り込んでください。
								</p>
							)}
						</div>
					)}
				</div>
				<ErrorNote error={catalog.error ?? catalog.data?.error} />
			</DialogContent>
		</Dialog>
	);
}
