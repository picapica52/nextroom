import { useState } from "react";
import { useLocalState } from "@/hooks/use-local-state";
import { STORAGE_KEYS } from "@/lib/constants";
import { type PanelTab, panelTabSchema } from "./components/side-panel";

/** Which panes of the chat page are open. On a wide screen the list and the side panel are docked
 *  and remembered; on a narrow one the list is a page of its own and the side panel a drawer,
 *  opened only when asked for. */
export function useChatLayout(wide: boolean) {
	const [listPinned, setListPinned] = useLocalState(STORAGE_KEYS.chatListOpen, true);
	const [panelPinned, setPanelPinned] = useLocalState(STORAGE_KEYS.chatPanelOpen, true);
	const [panelSheetOpen, setPanelSheetOpen] = useState(false);
	const [panelTab, setPanelTab] = useLocalState<PanelTab>(
		STORAGE_KEYS.chatPanelTab,
		"log",
		panelTabSchema,
	);
	const [captions, setCaptions] = useLocalState(STORAGE_KEYS.chatCaptions, true);
	const setPanelOpen = wide ? setPanelPinned : setPanelSheetOpen;

	return {
		listOpen: listPinned,
		setListOpen: setListPinned,
		panelOpen: wide ? panelPinned : panelSheetOpen,
		setPanelOpen,
		panelTab,
		setPanelTab,
		/** Opens the side panel at a tab. */
		openPanel: (tab: PanelTab) => {
			setPanelTab(tab);
			setPanelOpen(true);
		},
		captions,
		setCaptions,
	};
}

export type ChatLayout = ReturnType<typeof useChatLayout>;
