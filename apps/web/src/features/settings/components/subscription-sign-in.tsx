import type { SubscriptionLogin, SubscriptionProvider } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@nextroom/ui/components/dialog";
import { Input } from "@nextroom/ui/components/input";
import { Spinner } from "@nextroom/ui/components/spinner";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, LogIn, LogOut } from "lucide-react";
import { type ReactNode, useState } from "react";
import { AnchorButton } from "@/components/buttons";
import { useConfirm } from "@/components/confirm";
import { CopyButton } from "@/components/copy-button";
import { Dot, ErrorNote } from "@/components/status";
import { useSubscriptionActions, useSubscriptionLogin, useSubscriptions } from "@/hooks/queries";
import { qk } from "@/lib/query-keys";

const SUBSCRIPTION_NAMES: Record<SubscriptionProvider, string> = {
	chatgpt: "ChatGPT",
	claude: "Claude",
	copilot: "GitHub Copilot",
	grok: "SuperGrok",
};

/** Whether the user is signed in to the subscription, with the button that signs in or out. */
export function SubscriptionStatusRow({ provider }: { provider: SubscriptionProvider }) {
	const confirm = useConfirm();
	const status = useSubscriptions();
	const qc = useQueryClient();
	const { start, cancel, signOut } = useSubscriptionActions();
	const [open, setOpen] = useState(false);
	const [loginId, setLoginId] = useState<string | null>(null);
	const name = SUBSCRIPTION_NAMES[provider];
	const signedIn = status.data?.find((s) => s.provider === provider)?.signed_in;

	const signIn = () => {
		setLoginId(null);
		setOpen(true);
		start.mutate(provider, { onSuccess: (login) => setLoginId(login.id) });
	};

	return (
		<div className="-mt-3 flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
				{status.isPending ? (
					<Spinner className="size-3.5 text-muted-foreground" />
				) : signedIn ? (
					<Dot tone="success">{name} にサインイン済み</Dot>
				) : (
					<Dot tone="warning">{name} にサインインしていません</Dot>
				)}
				{signedIn ? (
					<Button
						variant="ghost"
						size="sm"
						disabled={signOut.isPending}
						onClick={async () => {
							if (
								await confirm({
									title: `${name} からサインアウトしますか？`,
									description: "サインインし直すまで、このサブスクリプションでは返答できません。",
									action: "サインアウト",
									destructive: true,
								})
							)
								signOut.mutate(provider);
						}}
					>
						<LogOut />
						サインアウト
					</Button>
				) : (
					<Button variant="outline" size="sm" onClick={signIn} disabled={status.isPending}>
						<LogIn />
						サインイン
					</Button>
				)}
			</div>
			<ErrorNote error={status.error ?? signOut.error} />
			<Dialog
				open={open}
				onOpenChange={(o) => {
					const login = loginId
						? qc.getQueryData<SubscriptionLogin>(qk.subscriptionLogin(loginId))
						: undefined;
					if (!o && login?.status === "pending") cancel.mutate(login.id);
					setOpen(o);
				}}
			>
				<DialogContent className="gap-4 sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{name} にサインイン</DialogTitle>
						<DialogDescription>
							{name} のアカウントでサインインすると、そのサブスクリプションで返答できます。
						</DialogDescription>
					</DialogHeader>
					{loginId ? (
						<LoginFlow id={loginId} onClose={() => setOpen(false)} onRetry={signIn} />
					) : start.error ? (
						<>
							<ErrorNote error={start.error} />
							<DialogFooter>
								<Button variant="outline" onClick={() => setOpen(false)}>
									閉じる
								</Button>
							</DialogFooter>
						</>
					) : (
						<Waiting>サインインの準備をしています…</Waiting>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}

function Waiting({ children }: { children: ReactNode }) {
	return (
		<div className="flex items-center gap-2 text-sm text-muted-foreground">
			<Spinner className="size-4" />
			{children}
		</div>
	);
}

/** One sign-in, from the page to open until it ends. */
function LoginFlow({
	id,
	onClose,
	onRetry,
}: {
	id: string;
	onClose: () => void;
	onRetry: () => void;
}) {
	const query = useSubscriptionLogin(id);
	const { answer, cancel } = useSubscriptionActions();
	const [code, setCode] = useState("");
	const l = query.data;

	if (!l) return query.error ? <ErrorNote error={query.error} /> : <Waiting>読み込み中…</Waiting>;

	if (l.status === "done")
		return (
			<>
				<div>
					<Dot tone="success">サインインしました</Dot>
				</div>
				<DialogFooter>
					<Button onClick={onClose}>閉じる</Button>
				</DialogFooter>
			</>
		);

	if (l.status !== "pending")
		return (
			<>
				{l.status === "error" ? (
					<ErrorNote error={l.error || "サインインできませんでした"} />
				) : (
					<p className="m-0 text-sm text-muted-foreground">サインインをキャンセルしました。</p>
				)}
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						閉じる
					</Button>
					<Button onClick={onRetry}>もう一度</Button>
				</DialogFooter>
			</>
		);

	return (
		<>
			{l.url && (
				<Step n={1} title="ページを開いてサインインします">
					<AnchorButton href={l.url} target="_blank" rel="noreferrer" className="self-start">
						<ExternalLink />
						サインインのページを開く
					</AnchorButton>
					<span className="font-mono text-xs break-all text-muted-foreground">{l.url}</span>
				</Step>
			)}
			{l.user_code && (
				<Step n={l.url ? 2 : 1} title="ページでこのコードを入力します">
					<div className="group/msg flex items-center gap-2">
						<code className="rounded-lg border-2 bg-muted px-3 py-1.5 font-mono text-lg font-bold tracking-widest">
							{l.user_code}
						</code>
						<CopyButton text={l.user_code} labelled />
					</div>
				</Step>
			)}
			{l.needs_code && (
				<Step n={l.url ? 2 : 1} title="ページに表示されたコードを貼り付けます">
					<form
						className="flex gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							if (code.trim()) answer.mutate({ id, code: code.trim() });
						}}
					>
						<Input
							aria-label="コード"
							value={code}
							onChange={(e) => setCode(e.target.value)}
							placeholder="コードを貼り付け"
							className="font-mono"
							autoComplete="off"
						/>
						<Button type="submit" disabled={!code.trim() || answer.isPending}>
							送信
						</Button>
					</form>
					<ErrorNote error={answer.error} />
				</Step>
			)}
			<Waiting>{l.message || "サインインを待っています…"}</Waiting>
			<ErrorNote error={query.error ?? cancel.error} />
			<DialogFooter>
				<Button
					variant="outline"
					disabled={cancel.isPending}
					onClick={() => cancel.mutate(id, { onSuccess: onClose })}
				>
					キャンセル
				</Button>
			</DialogFooter>
		</>
	);
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-2">
			<div className="text-sm font-bold">
				{n}. {title}
			</div>
			{children}
		</div>
	);
}
