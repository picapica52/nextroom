import type { ChatSessionSummary } from "@nextroom/contracts";
import { PanelLeftOpen, Search, Settings } from "lucide-react";
import { useRef } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { ChatLayout } from "../use-chat-layout";
import { ConversationList } from "./conversation-list";
import { CollapsiblePane, PaneRail, RailButton } from "./pane-rail";

/** The characters to talk with, docked at the left of a wide screen. */
export function ChatListPane({
	layout,
	sessions,
	currentId,
}: {
	layout: ChatLayout;
	sessions: ChatSessionSummary[];
	currentId: string | null;
}) {
	const navigate = useNavigate();
	const search = useRef<HTMLInputElement>(null);
	const list = (
		<ConversationList
			sessions={sessions}
			currentId={currentId}
			onClose={() => layout.setListOpen(false)}
			searchRef={search}
			className="h-full"
		/>
	);

	return (
		<CollapsiblePane
			open={layout.listOpen}
			width={256}
			rail={
				<PaneRail
					label="話し相手"
					open={<PanelLeftOpen />}
					onOpen={() => layout.setListOpen(true)}
					footer={
						<RailButton label="設定" onClick={() => navigate("/settings")}>
							<Settings />
						</RailButton>
					}
				>
					<RailButton
						label="名前で探す"
						onClick={() => {
							flushSync(() => layout.setListOpen(true));
							search.current?.focus();
						}}
					>
						<Search />
					</RailButton>
				</PaneRail>
			}
		>
			{list}
		</CollapsiblePane>
	);
}
