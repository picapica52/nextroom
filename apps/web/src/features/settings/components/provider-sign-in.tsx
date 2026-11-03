import type { LoginPrompt, ProviderLogin, ProviderStatus } from "@nextroom/contracts";
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
import { ExternalLink, KeyRound, LogIn, LogOut, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { AnchorButton } from "@/components/buttons";
import { useConfirm } from "@/components/confirm";
import { CopyButton } from "@/components/copy-button";
import { SimpleSelect } from "@/components/simple-select";
import { Dot, ErrorNote } from "@/components/status";
import { useProviderActions, useProviderLogin } from "@/hooks/queries";
import { qk } from "@/lib/query-keys";

/** Whether the provider can be used, and how: what was entered here, or the environment. */
export function ProviderBadge({ provider }: { provider: ProviderStatus }) {
	if (provider.stored === "oauth") return <Dot tone="success">サインイン済み</Dot>;
	if (provider.stored === "api_key") return <Dot tone="success">キー設定済み</Dot>;
	if (provider.configured)
		return <Dot tone="success">{`設定済み（${provider.source ?? "環境変数"}）`}</Dot>;
	return null;
}

/** A provider's ways of being set up, as pi offers them (an API key, a subscription's sign-in),
 *  and removing what was entered. */
export function ProviderActions({ provider }: { provider: ProviderStatus }) {
	const confirm = useConfirm();
	const { start, forget } = useProviderActions();
	const [open, setOpen] = useState<"api_key" | "oauth" | null>(null);
	const [loginId, setLoginId] = useState<string | null>(null);
	const { name, auth, stored } = provider;

	const begin = (type: "api_key" | "oauth") => {
		setLoginId(null);
		setOpen(type);
		start.mutate({ id: provider.id, type }, { onSuccess: (login) => setLoginId(login.id) });
	};

	return (
		<div className="flex flex-col items-end gap-2">
			<div className="flex flex-wrap items-center justify-end gap-2">
				{stored ? (
					<Button
						variant="ghost"
						size="sm"
						disabled={forget.isPending}
						onClick={async () => {
							if (
								await confirm({
									title:
										stored === "oauth"
											? `${name} からサインアウトしますか？`
											: `${name} の API キーを削除しますか？`,
									description: "設定し直すまで、このプロバイダーのモデルでは返答できません。",
									action: stored === "oauth" ? "サインアウト" : "削除",
									destructive: true,
								})
							)
								forget.mutate(provider.id);
						}}
					>
						{stored === "oauth" ? <LogOut /> : <Trash2 />}
						{stored === "oauth" ? "サインアウト" : "削除"}
					</Button>
				) : (
					<>
						{auth.oauth && (
							<Button variant="outline" size="sm" onClick={() => begin("oauth")}>
								<LogIn />
								サインイン
							</Button>
						)}
						{auth.api_key && (
							<Button variant="outline" size="sm" onClick={() => begin("api_key")}>
								<KeyRound />
								API キー
							</Button>
						)}
					</>
				)}
			</div>
			<ErrorNote error={forget.error} />
			<LoginDialog
				open={open !== null}
				onOpenChange={(o) => !o && setOpen(null)}
				title={open === "oauth" ? `${name} にサインイン` : `${name} の API キー`}
				description={
					open === "oauth"
						? `${auth.oauth ?? name} のアカウントでサインインします。`
						: `${auth.api_key ?? "API キー"} を入力します。キーはこの PC のデータベースに保存されます。`
				}
				loginId={loginId}
				startError={start.error}
				onRetry={() => open && begin(open)}
			/>
		</div>
	);
}

/** The dialog a sign-in runs in; closing it while the sign-in waits cancels it. */
function LoginDialog({
	open,
	onOpenChange,
	title,
	description,
	loginId,
	startError,
	onRetry,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	loginId: string | null;
	startError: unknown;
	onRetry: () => void;
}) {
	const qc = useQueryClient();
	const { cancel } = useProviderActions();
	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				const login = loginId
					? qc.getQueryData<ProviderLogin>(qk.providerLogin(loginId))
					: undefined;
				if (!o && login?.status === "pending") cancel.mutate(login.id);
				onOpenChange(o);
			}}
		>
			<DialogContent className="gap-4 sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				{loginId ? (
					<LoginFlow id={loginId} onClose={() => onOpenChange(false)} onRetry={onRetry} />
				) : startError ? (
					<>
						<ErrorNote error={startError} />
						<DialogFooter>
							<Button variant="outline" onClick={() => onOpenChange(false)}>
								閉じる
							</Button>
						</DialogFooter>
					</>
				) : (
					<Waiting>準備をしています…</Waiting>
				)}
			</DialogContent>
		</Dialog>
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
	const query = useProviderLogin(id);
	const { cancel } = useProviderActions();
	const l = query.data;

	if (!l) return query.error ? <ErrorNote error={query.error} /> : <Waiting>読み込み中…</Waiting>;

	if (l.status === "done")
		return (
			<>
				<div>
					<Dot tone="success">設定できました</Dot>
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
			{l.prompt && (
				<Step n={(l.url ? 1 : 0) + (l.user_code ? 1 : 0) + 1} title={promptTitle(l.prompt)}>
					<PromptAnswer key={`${l.prompt.type}:${l.prompt.message}`} id={id} prompt={l.prompt} />
				</Step>
			)}
			{l.prompt ? (
				l.message && <p className="m-0 text-sm text-muted-foreground">{l.message}</p>
			) : (
				<Waiting>{l.message || "サインインを待っています…"}</Waiting>
			)}
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

function promptTitle(prompt: LoginPrompt): string {
	if (prompt.type === "manual_code")
		return "サインイン後に表示されたコード（または移動先の URL）を貼り付けます";
	return prompt.message;
}

/** The answer to what the sign-in asks: a code, a key, a value (which may be left empty) or a choice. */
function PromptAnswer({ id, prompt }: { id: string; prompt: LoginPrompt }) {
	const { answer } = useProviderActions();
	const [value, setValue] = useState("");
	const [choice, setChoice] = useState<string | null>(prompt.options[0]?.id ?? null);
	const send = (code: string) => answer.mutate({ id, code });

	if (prompt.type === "select")
		return (
			<>
				<div className="flex gap-2">
					<SimpleSelect<string>
						value={choice}
						onChange={setChoice}
						options={prompt.options.map((o) => ({ value: o.id, label: o.label }))}
					/>
					<Button disabled={!choice || answer.isPending} onClick={() => choice && send(choice)}>
						次へ
					</Button>
				</div>
				{prompt.options.find((o) => o.id === choice)?.description && (
					<p className="m-0 text-xs text-muted-foreground">
						{prompt.options.find((o) => o.id === choice)?.description}
					</p>
				)}
				<ErrorNote error={answer.error} />
			</>
		);

	const optional = prompt.type === "text";
	return (
		<>
			<form
				className="flex gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					if (optional || value.trim()) send(value.trim());
				}}
			>
				<Input
					aria-label={prompt.message}
					type={prompt.type === "secret" ? "password" : "text"}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					placeholder={
						prompt.placeholder ??
						(prompt.type === "manual_code"
							? "コードを貼り付け"
							: optional
								? "空欄でもかまいません"
								: "")
					}
					className="font-mono"
					autoComplete="off"
				/>
				<Button type="submit" disabled={(!optional && !value.trim()) || answer.isPending}>
					送信
				</Button>
			</form>
			<ErrorNote error={answer.error} />
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
