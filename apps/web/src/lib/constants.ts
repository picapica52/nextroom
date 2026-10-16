/** How often (ms) the server's data is fetched again while it may be changing. */
export const POLL = {
	status: 2000,
	engineJobs: 1500,
	download: 1000,
	speechModels: 10_000,
	browserActive: 500,
	browserIdle: 3000,
	expressionBatch: 1000,
	chatReply: 400,
} as const;

/** The browser storage keys the app keeps its state under. */
export const STORAGE_KEYS = {
	chatSession: "irodori.chatSession",
	chatListOpen: "irodori.chatListOpen",
	chatPanelOpen: "irodori.chatPanelOpen",
	chatPanelTab: "irodori.chatPanelTab",
	chatLogOpen: "irodori.chatLogOpen",
	chatCaptions: "irodori.chatCaptions",
} as const;

/** How close (px) to the bottom a scrolled list still counts as at the bottom. */
export const SCROLL_BOTTOM_SLACK_PX = 40;

/** How long (ms) a copy button shows that it copied. */
export const COPIED_FEEDBACK_MS = 1400;
