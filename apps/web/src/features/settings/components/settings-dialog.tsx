import {
	Boxes,
	Link2,
	type LucideIcon,
	MessageSquareText,
	Radio,
	ScrollText,
	Wrench,
} from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { RouteDialog, RouteDialogClose, RouteDialogNav } from "@/components/route-dialog";
import { PaneHeader, SideNavItem } from "@/components/two-pane";

type Item = {
	to: string;
	label: string;
	summary: string;
	description: string;
	icon: LucideIcon;
	/** What the page needs to work, shown under its header. */
	note?: string;
};

const TOOL_CALLING = "返答モデルがツール呼び出し（function calling）に対応している必要があります。";

const CONNECTIONS: Item = {
	to: "/settings/connections",
	label: "接続",
	summary: "接続先と API キー",
	description: "外部サービスの接続先と API キー。サーバーの .env から読み、各ページが使います",
	icon: Link2,
};

const GROUPS: { label?: string; items: Item[] }[] = [
	{
		items: [
			CONNECTIONS,
			{
				to: "/settings/models",
				label: "モデル",
				summary: "返答・画像・音声に使うモデル",
				description: "アプリが使うモデルの一覧。API キーは .env で設定します",
				icon: Boxes,
			},
		],
	},
	{
		label: "会話",
		items: [
			{
				to: "/settings/reply",
				label: "返答のしかた",
				summary: "温度・長さ・Effort・読み上げ",
				description: "返答モデルが返答を作るときの設定と、読み上げのオン・オフ",
				icon: MessageSquareText,
			},
			{
				to: "/settings/prompt",
				label: "プロンプト",
				summary: "名前・カスタムプロンプト",
				description: "あなたの名前と、毎回の会話に付ける指示文",
				icon: ScrollText,
			},
		],
	},
	{
		label: "エージェント",
		items: [
			{
				to: "/settings/tools",
				label: "道具と権限",
				summary: "使う道具と確認のしかた",
				description: "キャラクターが使えるブラウザ・ファイルとコマンド・Claude と、その許可",
				icon: Wrench,
				note: TOOL_CALLING,
			},
		],
	},
	{
		label: "外部",
		items: [
			{
				to: "/settings/discord",
				label: "Discord",
				summary: "ボイスチャンネルで話す bot",
				description:
					"キャラクターが Discord のボイスチャンネルに bot として参加し、みんなと話します",
				icon: Radio,
			},
		],
	},
];

const ITEMS = GROUPS.flatMap((g) => g.items);

/**
 * App settings: the services' keys, the models, the conversation (how replies are made, prompts), the
 * agent's tools and the Discord bot, over the conversation: the items on the left and the open item
 * beside them, each scrolling on its own.
 */
export default function SettingsDialog() {
	const { pathname } = useLocation();
	const navigate = useNavigate();
	const current = ITEMS.find((i) => i.to === pathname.replace(/\/$/, "")) ?? CONNECTIONS;
	const close = () => navigate("/chat");

	return (
		<RouteDialog
			title="設定"
			onClose={close}
			nav={
				<RouteDialogNav label="設定の項目">
					<div className="hidden shrink-0 px-4 pt-5 pb-1 text-lg font-extrabold md:block">設定</div>
					<nav className="flex gap-1 overflow-x-auto p-1.5 md:min-h-0 md:flex-1 md:flex-col md:gap-3 md:overflow-x-visible md:overflow-y-auto md:p-2">
						{GROUPS.map((group) => (
							<section key={group.items[0]?.to} className="flex gap-1 md:flex-col">
								{group.label && (
									<div className="hidden px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground md:block">
										{group.label}
									</div>
								)}
								{group.items.map((item) => (
									<SideNavItem
										key={item.to}
										to={item.to}
										active={item === current}
										label={item.label}
										summary={item.summary}
									/>
								))}
							</section>
						))}
					</nav>
				</RouteDialogNav>
			}
		>
			<PaneHeader icon={current.icon} title={current.label} description={current.description}>
				<RouteDialogClose onClose={close} />
			</PaneHeader>
			{current.note && (
				<div className="shrink-0 border-b-2 bg-selected px-4 py-1.5 text-xs">{current.note}</div>
			)}
			<Outlet />
		</RouteDialog>
	);
}
