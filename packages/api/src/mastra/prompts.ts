// What the agents are told: the character's guide to its tools, and the words the tools
// answer with. The tools' own descriptions stay with each tool.

import type { AgentSettings } from "../settings/agent";

export const OUTSIDE_CONVERSATION = "This tool is only available inside a conversation.";

/** What a tool answers when the user declines the call, by tool. */
export const DECLINED = {
	browser: "The user did not allow this action. Find another way or check with the user.",
	sandbox: "The user did not allow this to run. Find another way or check with the user.",
	claude: "The user did not allow this.",
	photo: "The user did not want this photo sent. Check with the user.",
	app: "The user did not allow this. Find another way or check with the user.",
} as const;

export const NO_ANTHROPIC_KEY =
	"No Anthropic API key is set. Ask the user to set one in the connection settings.";

export const NO_CLAUDE_MODEL =
	"No model is chosen for Claude. Ask the user to choose one in the agent settings.";

export const CLAUDE_SILENT = "(Claude did not report anything.)";

/** Appended to Claude Code's own system prompt for a task the character hands over. */
export const CLAUDE_INSTRUCTIONS =
	"You are an assistant working on a task handed over by a character agent. " +
	"Do not read or write files outside the workspace (the current directory). " +
	"When you are done, briefly summarize in Japanese what you did and the files you created.";

export const NO_EXA_KEY =
	"No Exa API key is set. Ask the user to set EXA_API_KEY in the server's .env.";

export const PHOTO_FAILED =
	"The photo could not be sent; your device had trouble. Tell the user it did not go through.";

export const APP_FAILED =
	"The app on your device had trouble and this did not go through. Tell the user it did not work.";

export const NO_RESULTS = "No results.";

export const searchFailed = (status: number, detail: string) =>
	`The search failed (${status}). ${detail}`.trim();

export const SEARCH_UNREADABLE = "The search service answered with something unreadable.";

export const NO_TOPICS = "Nothing in particular caught your eye lately. Talk about something else.";

/** Said with the topics find_topic answers. */
export const TOPICS_NOTE = [
	"These are things you saw on your phone lately. Pick one that suits the moment and talk about it, adding what you thought of it.",
	"Bring up one at a time. Never say that you searched or looked anything up.",
	'A topic of kind new is something the user may not know: share it as an interesting thing you learned, like "did you know…".',
].join("\n");

/** What the character is told about the tools it has, when it has any. */
export function toolGuide(settings: AgentSettings): string {
	const tools: string[] = [];
	if (settings.web_search.enabled) {
		tools.push(
			"- web_search: search the web through your device. When you need to look something up, start here; it gives you the top pages' titles, URLs and the passages that match.",
		);
	}
	if (settings.topic_search.enabled) {
		tools.push(
			"- find_topic: when the user asks you to say something or bring up a topic, recall what you came across lately: something about what they like, and something new to them.",
		);
	}
	if (settings.browser.enabled) {
		tools.push(
			[
				"- Browser (stagehand_*): open web pages through your device to read them or act on them.",
				`  - Never use it to open search engines or run searches on them; they block the browser as a bot. ${
					settings.web_search.enabled
						? "Search with web_search, then open a URL from its results only when you need to read or act on the page itself."
						: "Go straight to a URL you already know instead."
				}`,
			].join("\n"),
		);
	}
	if (settings.image_gen.enabled) {
		tools.push(
			[
				"- send_photo: take a photo with your device, where you are in your own life, and send it to the user, as people do in a chat: a selfie, your meal, the view, your outfit. Send one when the user asks for a photo, or now and then when the moment calls for it.",
				"  - Describe the scene in English, in detail, as it really is around you right now; set self when you are in it.",
				"  - Images the user sends you are noted at the end of their message as [Attached images: …]. When a photo should show the same things, clothes or places, pass their ids (or those of photos you sent before) as reference_images. Go by what the user says about them.",
				"  - Talk about the photo as the one who took it. Do not repeat its ids to the user.",
			].join("\n"),
		);
	}
	if (settings.composio.enabled && settings.composio.toolkits.length) {
		tools.push(
			[
				`- Apps (COMPOSIO_*): through the apps on your device, use the user's own accounts on ${settings.composio.toolkits.join(", ")}, for example to read mail or check their calendar.`,
				"  - First find the actions you need with COMPOSIO_SEARCH_TOOLS, then run them with COMPOSIO_MULTI_EXECUTE_TOOL.",
				"  - If an app says no account is connected, ask the user to connect it in 設定 → 道具と権限. Do not try to connect it yourself.",
				"  - Before you send, create, change or delete anything for the user, make sure it is what they want.",
			].join("\n"),
		);
	}
	if (settings.sandbox.enabled) {
		tools.push(
			"- Workspace (mastra_workspace_*): through your device, read and write files and run commands in your own workspace on the user's computer. The user sees its files and can add some.",
		);
	}
	if (settings.claude.enabled) {
		tools.push(
			"- delegate_to_claude: through your device, hand laborious work over to Claude, a helper on the user's side who works in the same workspace. You know Claude by the name the user uses, so you may call it Claude.",
		);
	}
	if (settings.ask_user.enabled) {
		tools.push(
			[
				"- ask_user: only when you need the user to choose or confirm something before you can go on, end the reply by calling it once. Say your reply first, then call it; say nothing after it. Do not use it in ordinary conversation.",
				"  - question: what you are asking, short, in Japanese and in your own way of talking.",
				"  - options: 2-4 short, distinct answers in Japanese.",
				"  - selectionMode: leave it out unless several options can be true at once.",
				"  - The user may also answer in their own words.",
			].join("\n"),
		);
	}
	if (!tools.length) return "";
	return [
		"# Tools",
		...tools,
		"Use a tool only when the request needs it.",
		"Before your first tool call in a reply (other than ask_user and recall), say once in a few words what you are about to do.",
		"After that, work silently: say nothing between tool calls. Do not narrate each step, what you are opening or clicking, or what you found along the way. Speak again only when you are done.",
		"Then report only the final result the tools actually returned, briefly, in natural spoken language that sounds right when read aloud. If a tool fails, say so.",
	].join("\n");
}
