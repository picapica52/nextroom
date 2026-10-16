import { Button } from "@nextroom/ui/components/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@nextroom/ui/components/command";
import { FieldDescription } from "@nextroom/ui/components/field";
import { Popover, PopoverContent, PopoverTrigger } from "@nextroom/ui/components/popover";
import { cn } from "@nextroom/ui/lib/utils";
import type { UseQueryResult } from "@tanstack/react-query";
import { ChevronsUpDown, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { ErrorNote } from "@/components/status";

type ApiModel = { id: string; name: string; price?: { input: number; output: number } };

const usd = (v: number) => (v === 0 ? "無料" : `$${Number(v.toPrecision(3))}`);
const priceText = (p: { input: number; output: number }) =>
	`入力 ${usd(p.input)} / 出力 ${usd(p.output)}`;
/** Cheapest first; models without a price last. */
const byPrice = (a: ApiModel, b: ApiModel) =>
	(a.price ? a.price.input + a.price.output : Number.POSITIVE_INFINITY) -
	(b.price ? b.price.input + b.price.output : Number.POSITIVE_INFINITY);

/** The models grouped by the part of the id before "/" (OpenRouter's vendor), in id order. */
function groupsOf(models: ApiModel[]) {
	const groups = new Map<string, ApiModel[]>();
	for (const m of models) {
		const slash = m.id.indexOf("/");
		const key = slash > 0 ? m.id.slice(0, slash) : "";
		groups.set(key, [...(groups.get(key) ?? []), m]);
	}
	return [...groups];
}

/** Picks one of the models an API lists, searched by name or id; an id not listed can be typed in. */
export function ApiModelPicker({
	id,
	models,
	value,
	onChange,
	className,
}: {
	id?: string;
	models: UseQueryResult<ApiModel[]>;
	value: string;
	onChange: (model: string) => void;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [cheapFirst, setCheapFirst] = useState(false);
	const list = models.data ?? [];
	const priced = list.some((m) => m.price);
	const groups = priced && cheapFirst ? [["", [...list].sort(byPrice)] as const] : groupsOf(list);
	const current = list.find((m) => m.id === value);
	const typed = search.trim();
	const pick = (model: string) => {
		setOpen(false);
		setSearch("");
		if (model !== value) onChange(model);
	};

	return (
		<div className={cn("flex flex-col gap-2", className)}>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger
					render={
						<Button
							id={id}
							variant="outline"
							className="h-10 w-full justify-start gap-2.5 px-3 font-normal"
						/>
					}
				>
					<span className="flex min-w-0 flex-1 items-baseline gap-2.5 text-left">
						{!value ? (
							<span className="text-muted-foreground">モデルを選択</span>
						) : current && current.name !== current.id ? (
							<>
								<span className="truncate font-medium">{current.name}</span>
								<span className="truncate font-mono text-xs text-muted-foreground">{value}</span>
							</>
						) : (
							<span className="truncate font-mono">{value}</span>
						)}
					</span>
					{models.isFetching ? (
						<RefreshCw className="size-4! animate-spin text-muted-foreground" />
					) : (
						<ChevronsUpDown className="size-4! text-muted-foreground" />
					)}
				</PopoverTrigger>
				<PopoverContent align="start" className="w-(--anchor-width) min-w-80 p-0">
					<Command>
						<div className="flex items-center gap-1 pr-1">
							<div className="min-w-0 flex-1">
								<CommandInput
									placeholder="名前や ID で検索"
									value={search}
									onValueChange={setSearch}
								/>
							</div>
							<Button
								variant="ghost"
								size="icon"
								className="mt-1"
								aria-label="一覧を取り直す"
								title="一覧を取り直す"
								disabled={models.isFetching}
								onClick={() => models.refetch()}
							>
								<RefreshCw className={models.isFetching ? "animate-spin" : ""} />
							</Button>
						</div>
						<CommandList>
							<CommandEmpty>
								{models.isPending ? "一覧を取得中…" : "一覧に見つかりません"}
							</CommandEmpty>
							{groups.map(([group, items]) => (
								<CommandGroup key={group} heading={group || undefined}>
									{items.map((m) => (
										<CommandItem
											key={m.id}
											value={`${m.name} ${m.id}`}
											data-checked={m.id === value}
											onSelect={() => pick(m.id)}
										>
											<span className="flex min-w-0 flex-1 flex-col">
												<span className="truncate">{m.name}</span>
												{m.name !== m.id && (
													<span className="truncate font-mono text-[11px] text-muted-foreground">
														{m.id}
													</span>
												)}
											</span>
											{m.price && (
												<span className="flex flex-col items-end text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
													<span>入力 {usd(m.price.input)}</span>
													<span>出力 {usd(m.price.output)}</span>
												</span>
											)}
										</CommandItem>
									))}
								</CommandGroup>
							))}
							{typed && !list.some((m) => m.id === typed) && (
								<CommandGroup forceMount>
									<CommandItem forceMount value={`__typed ${typed}`} onSelect={() => pick(typed)}>
										<Plus />
										<span className="min-w-0 truncate">
											「<span className="font-mono">{typed}</span>」をそのまま使う
										</span>
									</CommandItem>
								</CommandGroup>
							)}
						</CommandList>
						{list.length > 0 && (
							<div className="flex items-center justify-between gap-2 border-t-2 border-border py-1 pr-1 pl-3 text-xs text-muted-foreground">
								<span>
									{list.length} モデル{priced && " · $/M トークン"}
								</span>
								{priced && (
									<span className="flex gap-0.5">
										{[
											{ cheap: false, label: "名前順" },
											{ cheap: true, label: "安い順" },
										].map((o) => (
											<Button
												key={o.label}
												variant="ghost"
												size="xs"
												aria-pressed={cheapFirst === o.cheap}
												className="aria-pressed:bg-selected aria-pressed:font-bold aria-pressed:text-selected-foreground"
												onClick={() => setCheapFirst(o.cheap)}
											>
												{o.label}
											</Button>
										))}
									</span>
								)}
							</div>
						)}
					</Command>
				</PopoverContent>
			</Popover>
			{current?.price && (
				<FieldDescription className="text-xs">
					{priceText(current.price)}（100 万トークンあたり）
				</FieldDescription>
			)}
			{value && models.isSuccess && !current && (
				<FieldDescription className="text-xs text-warning">
					このモデルは取得した一覧にありません
				</FieldDescription>
			)}
			<ErrorNote error={models.error} />
		</div>
	);
}
