import type { AgentSettingsView, ComposioToolkit } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { X } from "lucide-react";
import { SaveInput } from "@/components/save-field";
import { Dot, ErrorNote } from "@/components/status";
import { useComposioStatus, useConnectComposio } from "@/features/agent/queries";
import type { SetAgentSection } from "../agent-options";
import { SettingsBlock } from "./settings-layout";

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
		<SettingsBlock>
			<div className="text-sm">使うアプリ</div>
			{composio.toolkits.length > 0 && (
				<div className="flex flex-col divide-y divide-foreground/15">
					{composio.toolkits.map((slug) => {
						const toolkit = toolkitOf(slug);
						return (
							<div key={slug} className="flex items-center gap-2 py-2">
								{toolkit?.logo && <img src={toolkit.logo} alt="" className="size-5 shrink-0" />}
								<span className="min-w-0 flex-1 truncate text-sm">{toolkit?.name ?? slug}</span>
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
				placeholder="アプリを追加（gmail, notion, slack など）"
				onSave={add}
			/>
			<ErrorNote error={connect.error ?? status.error ?? status.data?.error} />
		</SettingsBlock>
	);
}
