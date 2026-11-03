import {
	Cpu,
	type LucideIcon,
	MessageCircle,
	Monitor,
	Plug,
	Settings,
	ShieldCheck,
	Volume2,
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

const TOOL_CALLING =
	"メインモデルがツール呼び出し（function calling）に対応している必要があります。";

const GENERAL: Item = {
	to: "/settings/general",
	label: "一般",
	summary: "名前・すべてのキャラクターへの指示",
	description: "あなたの名前と、すべてのキャラクターに伝える指示",
	icon: Settings,
};

const GROUPS: { label?: string; items: Item[] }[] = [
	{
		items: [
			GENERAL,
			{
				to: "/settings/models",
				label: "モデル",
				summary: "プロバイダーと使うモデル",
				description: "返答に使うサービスとモデル、フォールバック、画像のモデル",
				icon: Cpu,
			},
			{
				to: "/settings/voice",
				label: "音声",
				summary: "読み上げ・文字起こし",
				description: "speech.cpp と ElevenLabs、文字起こし、読み上げと通話中の表情",
				icon: Volume2,
			},
			{
				to: "/settings/approvals",
				label: "承認",
				summary: "実行前に確認するかどうか",
				description: "キャラクターが何かを変える前に確認するかどうかと、許可・ブロックした操作",
				icon: ShieldCheck,
			},
			{
				to: "/settings/messaging",
				label: "メッセージ",
				summary: "Discord の bot",
				description:
					"キャラクターが Discord のボイスチャンネルに bot として参加し、みんなと話します",
				icon: MessageCircle,
			},
			{
				to: "/settings/computer",
				label: "コンピューター",
				summary: "ブラウザ・ファイルとコマンド",
				description: "キャラクターがこの PC で使うブラウザと、ファイルとコマンドのワークスペース",
				icon: Monitor,
				note: TOOL_CALLING,
			},
			{
				to: "/settings/integrations",
				label: "連携",
				summary: "検索・アプリ・写真・ルーティン",
				description: "Web 検索、アプリ連携、写真、選択肢、ルーティン",
				icon: Plug,
				note: TOOL_CALLING,
			},
		],
	},
];

const ITEMS = GROUPS.flatMap((g) => g.items);

/**
 * App settings: general, the models, voice, approvals, messaging, the computer and the integrations,
 * over the conversation: the items on the left and the open item
 * beside them, each scrolling on its own.
 */
export default function SettingsDialog() {
	const { pathname } = useLocation();
	const navigate = useNavigate();
	const current = ITEMS.find((i) => i.to === pathname.replace(/\/$/, "")) ?? GENERAL;
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
