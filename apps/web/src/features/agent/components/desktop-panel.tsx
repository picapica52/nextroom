import type { AgentStep } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@nextroom/ui/components/card";
import { Hand, Power, PowerOff } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Dot, EmptyNote, ErrorNote } from "@/components/status";
import { desktopScreenUrl, useDesktopPower, useDesktopView } from "../desktop";
import { StepList } from "./steps";

/** The character's desktop, large: watch it work, or take over the mouse and keyboard. */
export function DesktopPanel({ characterId, steps }: { characterId: string; steps: AgentStep[] }) {
	const view = useDesktopView(characterId);
	const power = useDesktopPower(characterId);
	const [control, setControl] = useState(false);
	const desktop = view.data;
	const running = !!desktop?.running;
	const desktopSteps = steps.filter((s) => s.kind === "desktop");

	return (
		<div className="flex flex-col gap-4">
			{desktop && !desktop.enabled && (
				<p className="m-0 text-sm text-warning">
					コンピューターは今オフです。上の「道具」か
					<Link to="/settings/tools#computer-enabled" className="text-warning">
						設定 → 道具
					</Link>
					でオンにすると、キャラクターが自分のデスクトップを使えるようになります。
				</p>
			)}
			<div className="flex flex-wrap items-start gap-5">
				<section className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
					<div className="flex flex-wrap items-center gap-2">
						{running ? (
							<Dot tone={control ? "warning" : "info"}>
								{control ? "あなたが操作中" : "起動しています"}
							</Dot>
						) : desktop?.starting ? (
							<Dot tone="info">起動中…（初回は数分かかります）</Dot>
						) : (
							<Dot tone="muted">止まっています</Dot>
						)}
						<div className="ml-auto flex items-center gap-2">
							{running && (
								<Button
									variant={control ? "default" : "outline"}
									size="sm"
									onClick={() => setControl(!control)}
								>
									<Hand />
									{control ? "操作をキャラクターに戻す" : "操作を代わる"}
								</Button>
							)}
							{running ? (
								<Button
									variant="ghost"
									size="sm"
									className="text-destructive"
									disabled={power.isPending}
									onClick={() => {
										setControl(false);
										power.mutate(false);
									}}
								>
									<PowerOff />
									止める
								</Button>
							) : (
								<Button
									variant="outline"
									size="sm"
									disabled={!desktop?.enabled || desktop.starting || power.isPending}
									onClick={() => power.mutate(true)}
								>
									<Power />
									起動する
								</Button>
							)}
						</div>
					</div>
					<div className="aspect-[16/10] w-full overflow-hidden rounded-lg border-2 bg-[#1f1f1f]">
						{running ? (
							<iframe
								key={control ? "control" : "view"}
								title="デスクトップの画面"
								src={desktopScreenUrl(characterId, control)}
								className="size-full border-0"
								allow="clipboard-read; clipboard-write"
							/>
						) : (
							<div className="flex size-full items-center justify-center text-sm text-white/60">
								{desktop?.starting
									? "デスクトップを起動しています…"
									: "キャラクターが使うと起動します"}
							</div>
						)}
					</div>
					<p className="m-0 text-xs text-muted-foreground">
						「操作を代わる」と、画面をクリックしたりキーを打ったりできます（キャラクターの操作中でも割り込めます）。ログインなど、キャラクターに任せたくない操作はここで行ってください。
					</p>
					<ErrorNote error={power.error ?? (desktop?.error ? new Error(desktop.error) : null)} />
				</section>
				<Card className="flex-[1_1_320px]">
					<CardHeader>
						<CardTitle>操作の記録</CardTitle>
						<CardDescription className="text-xs">
							この会話でキャラクターが行ったデスクトップの操作
						</CardDescription>
					</CardHeader>
					<CardContent>
						{desktopSteps.length ? (
							<StepList sessionId={characterId} steps={[...desktopSteps].reverse()} />
						) : (
							<EmptyNote className="py-6">まだ操作はありません</EmptyNote>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
