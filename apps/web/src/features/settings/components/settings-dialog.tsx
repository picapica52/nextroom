import { Input } from "@nextroom/ui/components/input";
import { cn } from "@nextroom/ui/lib/utils";
import { Search } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { RouteDialog, RouteDialogClose, RouteDialogNav } from "@/components/route-dialog";
import { Dot } from "@/components/status";
import { SELECTED_ITEM } from "@/components/two-pane";
import { useDiscordSettings } from "@/features/discord/queries";
import { useSlackSettings } from "@/features/slack/queries";
import { useChatSettings } from "@/hooks/queries";
import {
	SETTINGS_PAGES,
	type SettingsPage,
	type SettingsPageId,
	searchSettings,
	settingsPath,
} from "../pages";
import { useHasLlmProvider } from "./connection-fields";

const ITEM =
	"flex shrink-0 items-center gap-2.5 rounded-lg border-2 border-transparent px-2.5 py-1.5 text-sm whitespace-nowrap text-foreground no-underline transition-colors duration-120 ease-smooth hover:bg-hover hover:text-foreground active:bg-pressed md:py-2";

/** App settings over the conversation: a search and the pages on the left (on top on a narrow
 *  screen), and the open page beside them. */
export default function SettingsDialog() {
	const { pathname } = useLocation();
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const current =
		SETTINGS_PAGES.find((p) => settingsPath(p.id) === pathname.replace(/\/$/, "")) ??
		(SETTINGS_PAGES[0] as SettingsPage);
	const badges = useBadges();
	const results = searchSettings(query);
	const close = () => navigate("/chat");

	return (
		<RouteDialog
			title="設定"
			onClose={close}
			nav={
				<RouteDialogNav label="設定の項目">
					<div className="hidden shrink-0 px-4 pt-5 pb-2 text-lg font-extrabold md:block">設定</div>
					<div className="shrink-0 px-1.5 pt-1.5 md:px-2 md:pt-0">
						<div className="relative">
							<Search
								className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
								aria-hidden="true"
							/>
							<Input
								type="search"
								aria-label="設定を検索"
								placeholder="設定を検索"
								className="pl-8"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								onKeyDown={(e) => {
									const first = results[0];
									if (e.key === "Enter" && !e.nativeEvent.isComposing && first) {
										navigate(settingsPath(first.page, first.anchor));
										setQuery("");
									}
								}}
							/>
						</div>
					</div>
					{query.trim() ? (
						<nav
							aria-label="検索結果"
							className="flex max-h-72 min-h-0 flex-col gap-0.5 overflow-y-auto p-1.5 md:max-h-none md:flex-1 md:p-2"
						>
							{results.length === 0 && (
								<p className="m-0 px-2.5 py-2 text-sm text-muted-foreground">見つかりません</p>
							)}
							{results.map((r) => (
								<Link
									key={`${r.page}#${r.anchor}`}
									to={settingsPath(r.page, r.anchor)}
									onClick={() => setQuery("")}
									className={cn(ITEM, "flex-col items-start gap-0 whitespace-normal md:py-1.5")}
								>
									<span>{r.label}</span>
									<span className="text-xs text-muted-foreground">
										{SETTINGS_PAGES.find((p) => p.id === r.page)?.label}
									</span>
								</Link>
							))}
						</nav>
					) : (
						<nav className="flex gap-1 overflow-x-auto p-1.5 md:min-h-0 md:flex-1 md:flex-col md:overflow-x-visible md:overflow-y-auto md:p-2">
							{SETTINGS_PAGES.map((page, i) => (
								<div key={page.id} className="contents">
									{page.group !== SETTINGS_PAGES[i - 1]?.group && (
										<div className="hidden px-2.5 pt-3 pb-1 text-xs font-bold text-muted-foreground first:pt-1 md:block">
											{page.group}
										</div>
									)}
									<Link
										to={settingsPath(page.id)}
										aria-current={page === current ? "page" : undefined}
										className={cn(ITEM, page === current && SELECTED_ITEM)}
									>
										<page.icon className="size-4 shrink-0" aria-hidden="true" />
										<span className="flex-1">{page.label}</span>
										{badges[page.id]}
									</Link>
								</div>
							))}
						</nav>
					)}
				</RouteDialogNav>
			}
		>
			<header className="flex min-h-16 shrink-0 items-center gap-3 border-b-2 py-2 pr-3 pl-5 sm:pl-6">
				<div className="flex min-w-0 flex-1 flex-col">
					<h1 className="m-0 truncate text-base font-extrabold">{current.label}</h1>
					<p className="m-0 truncate text-xs text-muted-foreground">{current.description}</p>
				</div>
				<RouteDialogClose onClose={close} />
			</header>
			<Outlet />
		</RouteDialog>
	);
}

/** What a page needs before things work, or whether its bot is on, beside its name. */
function useBadges(): Partial<Record<SettingsPageId, ReactNode>> {
	const ready = useHasLlmProvider();
	const chat = useChatSettings().data;
	const discord = useDiscordSettings().data;
	const slack = useSlackSettings().data;
	return {
		connections: ready === false && <Dot tone="warning">要設定</Dot>,
		models: ready && chat && !chat.main_model && <Dot tone="warning">要設定</Dot>,
		discord: discord?.enabled && <Dot tone="info">オン</Dot>,
		slack: slack?.enabled && <Dot tone="info">オン</Dot>,
	};
}
