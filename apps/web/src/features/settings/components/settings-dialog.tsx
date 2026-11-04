import { Input } from "@nextroom/ui/components/input";
import { cn } from "@nextroom/ui/lib/utils";
import { Search } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
	RouteDialog,
	RouteDialogBack,
	RouteDialogClose,
	RouteDialogNav,
} from "@/components/route-dialog";
import { Dot } from "@/components/status";
import { SELECTED_ITEM } from "@/components/two-pane";
import { useDiscordSettings } from "@/features/discord/queries";
import { useSlackSettings } from "@/features/slack/queries";
import { useChatSettings } from "@/hooks/queries";
import { useMedium } from "@/hooks/use-media-query";
import {
	SETTINGS_PAGES,
	type SettingsPage,
	type SettingsPageId,
	searchSettings,
	settingsPath,
} from "../pages";
import { useHasLlmProvider } from "./connection-fields";

const ITEM =
	"flex shrink-0 items-center gap-2.5 rounded-lg border-2 border-transparent px-2.5 py-1.5 text-sm whitespace-nowrap text-foreground no-underline transition-colors duration-120 ease-smooth hover:bg-hover hover:text-foreground active:bg-pressed max-md:py-2.5 md:py-2";

/** App settings over the conversation: a search and the pages on the left, and the open page
 *  beside them. A narrow screen shows the pages at /settings and one page at a time below it. */
export default function SettingsDialog() {
	const { pathname } = useLocation();
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const atIndex = pathname.replace(/\/$/, "") === "/settings";
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
			show={atIndex ? "nav" : "page"}
			nav={
				<RouteDialogNav label="設定の項目">
					<div className="flex shrink-0 items-center gap-2 pt-3 pr-2 pb-2 pl-4 md:pt-5">
						<div className="flex-1 text-lg font-extrabold">設定</div>
						<div className="md:hidden">
							<RouteDialogClose onClose={close} />
						</div>
					</div>
					<div className="shrink-0 px-2">
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
							className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2"
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
						<nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
							{SETTINGS_PAGES.map((page, i) => (
								<div key={page.id} className="contents">
									{page.group !== SETTINGS_PAGES[i - 1]?.group && (
										<div className="px-2.5 pt-3 pb-1 text-xs font-bold text-muted-foreground first:pt-1">
											{page.group}
										</div>
									)}
									<Link
										to={settingsPath(page.id)}
										aria-current={!atIndex && page === current ? "page" : undefined}
										className={cn(ITEM, !atIndex && page === current && SELECTED_ITEM)}
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
			{atIndex && <SettingsIndex />}
			<header className="flex min-h-16 shrink-0 items-center gap-3 border-b-2 py-2 pr-3 pl-3 sm:pl-6">
				<RouteDialogBack to="/settings" label="設定の項目へ戻る" />
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

/** /settings opens the first page, except on a narrow screen, where it is the list of pages. */
function SettingsIndex() {
	const medium = useMedium();
	return medium ? <Navigate to={settingsPath("general")} replace /> : null;
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
