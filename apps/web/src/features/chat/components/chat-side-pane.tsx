import type { ChatMessage } from "@nextroom/contracts";
import { Drawer, DrawerContent, DrawerTitle } from "@nextroom/ui/components/drawer";
import { PanelRightOpen, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useExtraWide } from "@/hooks/use-media-query";
import type { ChatLayout } from "../use-chat-layout";
import { CollapsiblePane, PaneRail, RailUpload } from "./pane-rail";
import { SidePanel } from "./side-panel";

/** The log and the files beside the conversation on a wide screen; on a narrow one, a drawer from
 *  the bottom. */
export function ChatSidePane({
	wide,
	layout,
	sessionId,
	messages,
	log,
}: {
	wide: boolean;
	layout: ChatLayout;
	sessionId: string | null;
	messages: ChatMessage[];
	log: ReactNode;
}) {
	const extraWide = useExtraWide();
	if (!wide)
		return (
			<Drawer open={layout.panelOpen} onOpenChange={layout.setPanelOpen}>
				<DrawerContent className="h-[85dvh]">
					<DrawerTitle className="sr-only">会話ログとファイル</DrawerTitle>
					<SidePanel
						className="min-h-0 flex-1"
						sessionId={sessionId}
						messages={messages}
						log={log}
						tab={layout.panelTab}
						onTab={layout.setPanelTab}
						onClose={() => layout.setPanelOpen(false)}
						closeIcon={<XIcon />}
					/>
				</DrawerContent>
			</Drawer>
		);
	return (
		<CollapsiblePane
			open={layout.panelOpen}
			width={extraWide ? 380 : 300}
			className="min-w-0"
			rail={
				<PaneRail
					label="会話ログとファイル"
					open={<PanelRightOpen />}
					onOpen={() => layout.setPanelOpen(true)}
				>
					<RailUpload characterId={sessionId} />
				</PaneRail>
			}
		>
			<SidePanel
				className="h-full"
				sessionId={sessionId}
				messages={messages}
				log={log}
				tab={layout.panelTab}
				onTab={layout.setPanelTab}
				onClose={() => layout.setPanelOpen(false)}
			/>
		</CollapsiblePane>
	);
}
