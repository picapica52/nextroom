import type { AgentStep, BrowserInput } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@nextroom/ui/components/card";
import { Input } from "@nextroom/ui/components/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CornerDownLeft, Delete, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Dot, EmptyNote, ErrorNote } from "@/components/status";
import { client, read } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { sendBrowserInput, useBrowserView } from "../browser";
import { useAgentSettings } from "../queries";
import { BrowserLive } from "./browser-live";
import { StepList } from "./steps";

/** The conversation's browser, large: watch the agent work, or take over with clicks and typing. */
export function BrowserPanel({ sessionId, steps }: { sessionId: string; steps: AgentStep[] }) {
	const qc = useQueryClient();
	const settings = useAgentSettings();
	const view = useBrowserView(sessionId);
	const [text, setText] = useState("");
	const type = useMutation({
		mutationFn: (input: BrowserInput) => sendBrowserInput(sessionId, input),
	});
	const close = useMutation({
		mutationFn: () => read(client.browser[":id"].close.$post({ param: { id: sessionId } })),
		onSuccess: () => qc.invalidateQueries({ queryKey: qk.browser(sessionId) }),
	});
	const browserSteps = steps.filter((s) => s.kind === "browser");
	const active = !!view.data?.active;

	return (
		<div className="flex flex-col gap-4">
			{settings.data && !settings.data.browser.enabled && (
				<p className="m-0 text-sm text-warning">
					ブラウザは今オフです。上の「道具」か
					<Link to="/settings/tools" className="text-warning">
						設定 → 道具と権限
					</Link>
					でオンにすると、キャラクターが Web ページを開いて調べられるようになります。
				</p>
			)}
			<div className="flex flex-wrap items-start gap-5">
				<section className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
					<div className="flex items-center gap-2 overflow-hidden rounded-lg border-2 bg-background px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
						{active ? <Dot tone="warning">開いています</Dot> : <Dot tone="muted">閉じています</Dot>}
						<span className="truncate" title={view.data?.url ?? undefined}>
							{view.data?.url ?? ""}
						</span>
					</div>
					<BrowserLive sessionId={sessionId} view={view.data} interactive={active} />
					{active && (
						<form
							className="flex flex-wrap items-center gap-2"
							onSubmit={(e) => {
								e.preventDefault();
								if (!text) return;
								type.mutate({ type: "text", text });
								setText("");
							}}
						>
							<Input
								className="min-w-48 flex-1"
								value={text}
								placeholder="クリックした入力欄に文字を入れる"
								aria-label="ページに入力する文字"
								onChange={(e) => setText(e.target.value)}
							/>
							<Button type="submit" variant="outline" size="sm" disabled={!text}>
								入力
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => type.mutate({ type: "key", key: "Enter" })}
							>
								<CornerDownLeft />
								Enter
							</Button>
							<Button
								type="button"
								variant="outline"
								size="icon-sm"
								aria-label="1文字消す"
								title="1文字消す"
								onClick={() => type.mutate({ type: "key", key: "Backspace" })}
							>
								<Delete />
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="ml-auto text-destructive"
								onClick={() => close.mutate()}
							>
								<X />
								ブラウザを閉じる
							</Button>
						</form>
					)}
					<p className="m-0 text-xs text-muted-foreground">
						画面をクリックするとその場所をクリックできます（エージェントの操作中でも割り込めます）。ログインなど、キャラクターに任せたくない操作はここで行ってください。
					</p>
					<ErrorNote error={type.error ?? close.error} />
				</section>
				<Card className="flex-[1_1_320px]">
					<CardHeader>
						<CardTitle>操作の記録</CardTitle>
						<CardDescription className="text-xs">
							この会話でキャラクターが行ったブラウザ操作
						</CardDescription>
					</CardHeader>
					<CardContent>
						{browserSteps.length ? (
							<StepList sessionId={sessionId} steps={[...browserSteps].reverse()} />
						) : (
							<EmptyNote className="py-6">まだ操作はありません</EmptyNote>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
