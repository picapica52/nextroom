import type { ChatMessage } from "@nextroom/contracts";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@nextroom/ui/components/sheet";
import { PanelRightOpen } from "lucide-react";
import type { ReactNode } from "react";
import type { ChatLayout } from "../use-chat-layout";
import { CollapsiblePane, PaneRail, RailUpload } from "./pane-rail";
import { SidePanel } from "./side-panel";

/** The log and the files beside the conversation on a wide screen; on a narrow one, the files as a
 *  sheet (the log opens under the face instead). */
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
	if (!wide)
		return (
			layout.filesOpen && (
				<Sheet open={layout.filesOpen} onOpenChange={layout.setFilesOpen}>
					<SheetContent side="right" className="w-[92vw] p-0 sm:max-w-md" showCloseButton={false}>
						<SheetHeader className="sr-only">
							<SheetTitle>ファイル</SheetTitle>
						</SheetHeader>
						<SidePanel
							className="h-full"
							sessionId={sessionId}
							messages={messages}
							onClose={() => layout.setFilesOpen(false)}
						/>
					</SheetContent>
				</Sheet>
			)
		);
	return (
		<CollapsiblePane
			open={layout.panelOpen}
			width={380}
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
