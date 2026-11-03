import { cn } from "@nextroom/ui/lib/utils";
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
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { RouteDialog, RouteDialogClose, RouteDialogNav } from "@/components/route-dialog";
import { SELECTED_ITEM } from "@/components/two-pane";

type Item = { to: string; label: string; icon: LucideIcon };

const ITEMS: Item[] = [
	{ to: "/settings/general", label: "一般", icon: Settings },
	{ to: "/settings/models", label: "モデル", icon: Cpu },
	{ to: "/settings/voice", label: "音声", icon: Volume2 },
	{ to: "/settings/approvals", label: "承認", icon: ShieldCheck },
	{ to: "/settings/messaging", label: "メッセージ", icon: MessageCircle },
	{ to: "/settings/computer", label: "コンピューター", icon: Monitor },
	{ to: "/settings/integrations", label: "連携", icon: Plug },
];

/** App settings over the conversation: the pages on the left (on top on a narrow screen) and the
 *  open page beside them. */
export default function SettingsDialog() {
	const { pathname } = useLocation();
	const navigate = useNavigate();
	const current = ITEMS.find((i) => i.to === pathname.replace(/\/$/, "")) ?? (ITEMS[0] as Item);
	const close = () => navigate("/chat");

	return (
		<RouteDialog
			title="設定"
			onClose={close}
			nav={
				<RouteDialogNav label="設定の項目">
					<div className="hidden shrink-0 px-4 pt-5 pb-2 text-lg font-extrabold md:block">設定</div>
					<nav className="flex gap-1 overflow-x-auto p-1.5 md:min-h-0 md:flex-1 md:flex-col md:overflow-x-visible md:overflow-y-auto md:p-2">
						{ITEMS.map((item) => {
							const active = item === current;
							return (
								<Link
									key={item.to}
									to={item.to}
									aria-current={active ? "page" : undefined}
									className={cn(
										"flex shrink-0 items-center gap-2.5 rounded-lg border-2 border-transparent px-2.5 py-1.5 text-sm whitespace-nowrap text-foreground no-underline transition-colors duration-120 ease-smooth hover:bg-hover hover:text-foreground active:bg-pressed md:py-2",
										active && SELECTED_ITEM,
									)}
								>
									<item.icon className="size-4 shrink-0" aria-hidden="true" />
									{item.label}
								</Link>
							);
						})}
					</nav>
				</RouteDialogNav>
			}
		>
			<header className="flex min-h-14 shrink-0 items-center gap-3 border-b-2 py-2 pr-3 pl-5 sm:pl-6">
				<h1 className="m-0 min-w-0 flex-1 truncate text-base font-extrabold">{current.label}</h1>
				<RouteDialogClose onClose={close} />
			</header>
			<Outlet />
		</RouteDialog>
	);
}
