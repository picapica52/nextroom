import type { AgentSettingsView, ComposioToolkit } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@nextroom/ui/components/field";
import { X } from "lucide-react";
import { SaveInput } from "@/components/save-field";
import { Dot, ErrorNote } from "@/components/status";
import { useComposioStatus, useConnectComposio } from "@/features/agent/queries";
import type { SetAgentSection } from "../agent-options";

export function composioToolSummary(composio: AgentSettingsView["composio"]) {
	if (!composio.has_api_key) return "Composio の API キーが未設定です（.env の COMPOSIO_API_KEY）";
	if (!composio.toolkits.length) return "使うアプリが未設定です";
	return `${composio.toolkits.join("・")} を使います`;
}

/** The apps the character may use through Composio, and the accounts connected to them. */
export function ComposioToolSettings({
	composio,
	set,
}: {
	composio: AgentSettingsView["composio"];
	set: SetAgentSection;
}) {
	const status = useComposioStatus(composio.has_api_key);
	const connect = useConnectComposio();
	const setToolkits = (toolkits: string[]) => set("composio", { toolkits });
	const add = (text: string) => {
		const slugs = text
			.split(/[\s,、]+/)
			.map((s) => s.trim().toLowerCase())
			.filter(Boolean);
		if (!slugs.length) return true;
		return setToolkits([...new Set([...composio.toolkits, ...slugs])]);
	};
	const toolkitOf = (slug: string): ComposioToolkit | undefined =>
		status.data?.toolkits.find((t) => t.slug === slug);

	return (
		<>
			<Field>
				<FieldLabel>使うアプリ</FieldLabel>
				{composio.toolkits.length > 0 && (
					<div className="flex flex-col">
						{composio.toolkits.map((slug) => {
							const toolkit = toolkitOf(slug);
							return (
								<div
									key={slug}
									className="flex items-center gap-2 border-b border-foreground/15 py-2 last:border-b-0"
								>
									{toolkit?.logo && <img src={toolkit.logo} alt="" className="size-5 shrink-0" />}
									<span className="min-w-0 flex-1 truncate text-sm">
										{toolkit?.name ?? slug}
										<span className="ml-2 font-mono text-xs text-muted-foreground">{slug}</span>
									</span>
									{toolkit &&
										(toolkit.connected ? (
											<Dot tone="success">{toolkit.no_auth ? "接続不要" : "接続済み"}</Dot>
										) : (
											<Button
												variant="outline"
												size="sm"
												disabled={connect.isPending}
												onClick={() => connect.mutate(slug)}
											>
												接続
											</Button>
										))}
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label={`${slug} を外す`}
										onClick={() => setToolkits(composio.toolkits.filter((t) => t !== slug))}
									>
										<X />
									</Button>
								</div>
							);
						})}
					</div>
				)}
				<SaveInput
					id="composio-toolkit"
					className="font-mono"
					value=""
					placeholder="追加するアプリ（例: gmail, googlecalendar, notion, slack）"
					onSave={add}
				/>
				<FieldDescription>
					アプリは Composio の toolkit 名で指定します（
					<a href="https://composio.dev/toolkits" target="_blank" rel="noreferrer">
						一覧
					</a>
					）。「接続」を押すとサインインのページが開き、終わるとこの画面に戻ります。メールや予定などのデータは
					Composio のサーバーを通ります。
				</FieldDescription>
			</Field>
			<ErrorNote error={connect.error ?? status.error ?? status.data?.error} />
		</>
	);
}
