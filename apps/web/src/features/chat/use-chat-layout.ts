import { useState } from "react";
import { useLocalState } from "@/hooks/use-local-state";
import { STORAGE_KEYS } from "@/lib/constants";
import { type PanelTab, panelTabSchema } from "./components/side-panel";

/** Which panes of the chat page are open. On a wide screen the list and the side panel are docked
 *  and remembered; on a narrow one the list and the files are sheets, opened only when asked for,
 *  and the log opens between the face and the bar. */
export function useChatLayout(wide: boolean) {
	const [listPinned, setListPinned] = useLocalState(STORAGE_KEYS.chatListOpen, true);
	const [listSheetOpen, setListSheetOpen] = useState(false);
	const [panelOpen, setPanelOpen] = useLocalState(STORAGE_KEYS.chatPanelOpen, true);
	const [panelTab, setPanelTab] = useLocalState<PanelTab>(
		STORAGE_KEYS.chatPanelTab,
		"log",
		panelTabSchema,
	);
	const [filesOpen, setFilesOpen] = useState(false);
	const [logOpen, setLogOpen] = useLocalState(STORAGE_KEYS.chatLogOpen, false);
	const [captions, setCaptions] = useLocalState(STORAGE_KEYS.chatCaptions, true);

	return {
		listOpen: wide ? listPinned : listSheetOpen,
		setListOpen: (open: boolean) => (wide ? setListPinned(open) : setListSheetOpen(open)),
		closeListSheet: () => setListSheetOpen(false),
		panelOpen,
		setPanelOpen,
		panelTab,
		setPanelTab,
		filesOpen,
		setFilesOpen,
		logOpen,
		setLogOpen,
		captions,
		setCaptions,
		/** Shows the conversation log: the side panel's tab, or the log under the face. */
		showLog: () => {
			if (!wide) return setLogOpen(true);
			setPanelOpen(true);
			setPanelTab("log");
		},
	};
}

export type ChatLayout = ReturnType<typeof useChatLayout>;
