import type { AgentSettingsView, ComposioToolkit } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Dot, ErrorNote } from "@/components/status";
import { useComposioStatus, useConnectComposio } from "@/features/agent/queries";
import { qk } from "@/lib/query-keys";
import type { SetAgentSection } from "../agent-options";
import { ComposioAppPicker } from "./composio-app-picker";
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
	const qc = useQueryClient();
	const setToolkits = async (toolkits: string[]) => {
		if (await set("composio", { toolkits }))
			await qc.invalidateQueries({ queryKey: qk.composio(), exact: true });
	};
	const [picking, setPicking] = useState(false);
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
			<Button variant="outline" size="sm" className="self-start" onClick={() => setPicking(true)}>
				<Plus />
				アプリを追加
			</Button>
			<ComposioAppPicker
				open={picking}
				onOpenChange={setPicking}
				added={composio.toolkits}
				onAdd={(slug) => setToolkits([...new Set([...composio.toolkits, slug])])}
			/>
			<ErrorNote error={connect.error ?? status.error ?? status.data?.error} />
		</SettingsBlock>
	);
}
