// The prompt for a conversation: the fixed system prompt, the user's custom prompt and the fixed style prompt, then the setting (the voice-call device) and the character's persona before the
// conversation, and the current time and when the two last talked after it.

import { STYLE_PROMPT, SYSTEM_PROMPT } from "./instructions";
import type { Character } from "./store";

const MACRO = /\{\{\s*(char|user)\s*\}\}|<(BOT|USER)>/gi;
const COMMENT = /\{\{\/\/[\s\S]*?\}\}/g;

/** {{char}} when the conversation has no character. */
const ASSISTANT_NAME = "Assistant";

/** Replace `{{char}}` / `{{user}}` (and the V1 `<BOT>` / `<USER>`); drop `{{// …}}`. */
function expandMacros(text: string, charName: string, userName: string): string {
	return text
		.replace(COMMENT, "")
		.replace(MACRO, (_, a: string | undefined, b: string | undefined) => {
			const key = (a ?? b ?? "").toLowerCase();
			return key === "char" || key === "bot" ? charName : userName;
		});
}

interface ConversationPrompt {
	/** The main prompt, the custom prompt, then the style prompt. */
	system: string;
	/** System messages between the main prompt and the conversation: the character's persona. */
	beforeHistory: string[];
	/** The system message after the conversation; empty for none. */
	postHistory: string;
}

interface PromptSettings {
	custom_prompt: string;
	user_name: string;
}

const WEEKDAYS = "日月火水木金土";

const pad = (n: number) => String(n).padStart(2, "0");

const dateTime = (date: Date) =>
	`${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（${WEEKDAYS[date.getDay()]}）${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** The local date and time, so the character lives in the same "now" as the user. */
const nowLine = (date: Date) => `Current time: ${dateTime(date)}`;

/** How long ago, in the largest unit that fits. */
function elapsed(ms: number): string {
	const minutes = Math.max(Math.floor(ms / 60_000), 0);
	const units: [number, string][] = [
		[60 * 24 * 365, "year"],
		[60 * 24 * 30, "month"],
		[60 * 24 * 7, "week"],
		[60 * 24, "day"],
		[60, "hour"],
		[1, "minute"],
	];
	const [size, unit] = units.find(([size]) => minutes >= size) ?? [1, "minute"];
	const n = Math.floor(minutes / size);
	return n ? `about ${n} ${unit}${n === 1 ? "" : "s"} ago` : "just now";
}

/** When the two last talked, so the character knows how long they have been apart. */
const lastTalkLine = (char: string, user: string, at: Date, now: Date) =>
	`${char} and ${user} last talked: ${dateTime(at)} (${elapsed(now.getTime() - at.getTime())})`;

const joined = (parts: string[]) => parts.filter(Boolean).join("\n\n");

const section = (title: string, body: string) => (body ? `# ${title}\n${body}` : "");

/** How the character and the user came to talk: through a voice-call device in the character's
 *  room that suddenly connected to the user's. */
const setting = (char: string, user: string) =>
	`${char} lives in the world described below, not in ${user}'s. In ${char}'s room there is a device for talking with someone far away by voice, ` +
	`as described under "${char}'s device". ` +
	`One day it suddenly connected to ${user}'s device, and since then the two talk through it, hearing each other's voices. ` +
	"No one knows why the two devices connected.\n" +
	`- It carries only sound: ${user} cannot see ${char}'s face, clothes, body, room or anything ${char} holds up, and ${char} knows this. ` +
	`All ${user} gets of ${char} is ${char}'s voice and the sounds around ${char}. ` +
	`To show something, ${char} takes a photo and sends it, or tells about it in words.\n` +
	`- ${char} and ${user} were strangers when the devices first connected. How close they are now comes only from what ${char} remembers of their talks.\n` +
	`- ${char} cannot go to ${user}'s world or touch anything in it, and ${user} cannot come to ${char}'s. ` +
	`Through the connection, ${char}'s tools can still reach ${user}'s computer and really act on it.\n` +
	`- ${char} knows ${char}'s own world, not ${user}'s. Things of ${user}'s world are new to ${char} unless ${char}'s world has them too.\n` +
	`- Time passes at the same pace in both worlds. While the two are not talking, ${char} goes on living in ${char}'s own world. ` +
	`When they talk again after a while apart, ${char} feels how long it has been and may bring up what ${char} did in the meantime, in a way that fits ${char}'s world, room and personality.`;

/** The device and what it does, as things of the character's world; a blank one is left to the LLM. */
const device = (char: string, text: string) =>
	`Describe the device and what it does as things of ${char}'s world, in what ${char} says. ` +
	`Never call them by their tool names or by the names of technology or services that ${char}'s world does not have.\n` +
	(text || `Not set: choose a name and form that fit ${char}'s world and keep using them.`);

/** The day's routine, read against the current time for what the character is doing now. */
const daily = (char: string, text: string) =>
	text &&
	`${text}\nFrom the current time, ${char} is in the middle of whatever this routine has them doing.`;

/** A secret the character keeps until trust is built. */
const secret = (char: string, user: string, text: string) =>
	text &&
	`${text}\n${char} does not bring this up on their own. Only when ${char} has come to trust ${user} deeply may it slip out, or ${char} may choose to tell it.`;

export function conversationPrompt(
	character: Character | null,
	settings: PromptSettings,
	lastTalk: Date | null = null,
): ConversationPrompt {
	const userName = settings.user_name;
	const charName = character?.persona.name ?? ASSISTANT_NAME;
	const expand = (text: string) => expandMacros(text, charName, userName).trim();
	const system = joined([
		expand(SYSTEM_PROMPT),
		expand(settings.custom_prompt),
		expand(STYLE_PROMPT),
	]);
	const now = new Date();
	const lastTalkNote = character && lastTalk ? lastTalkLine(charName, userName, lastTalk, now) : "";
	const postHistory = [nowLine(now), lastTalkNote].filter(Boolean).join("\n");
	if (!character) return { system, beforeHistory: [], postHistory };

	const { persona } = character;
	const sheet = joined([
		section("Setting", setting(charName, userName)),
		section(`${charName}'s world`, expand(persona.world)),
		section(`${charName}'s profile`, expand(persona.profile)),
		section("Appearance", expand(persona.appearance)),
		section("Personality", expand(persona.personality)),
		section(`How ${charName} talks`, expand(persona.speech)),
		section("Habits and gestures", expand(persona.habits)),
		section("Likes and dislikes", expand(persona.likes)),
		section("Values", expand(persona.values)),
		section("Goals and dreams", expand(persona.goals)),
		section("Worries and weaknesses", expand(persona.worries)),
		section(`${charName}'s secret`, secret(charName, userName, expand(persona.secret))),
		section(`${charName}'s past`, expand(persona.backstory)),
		section(`People in ${charName}'s life`, expand(persona.relationships)),
		section(`How ${charName} sees love`, expand(persona.love)),
		section(`${charName}'s daily life`, daily(charName, expand(persona.daily))),
		section(`What ${charName} has been up to lately`, expand(persona.recent)),
		section(`Where ${charName} lives`, expand(persona.surroundings)),
		section(`${charName}'s treasured belongings`, expand(persona.belongings)),
		section(`${charName}'s room, where the device is`, expand(persona.room)),
		section(`${charName}'s device`, device(charName, expand(persona.device))),
	]);
	return { system, beforeHistory: [sheet], postHistory };
}
