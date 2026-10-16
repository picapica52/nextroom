// Turns a chosen event into what the character is told after the conversation. Events about
// what the two talked about are first drafted by the conversation's LLM from the character's
// notes and its conversations, and dropped unless the draft points at messages that were really
// said (or at the notes): an event never makes up a past. Also reads the user's answer to a
// confession.

import {
	type AffinityEventKind,
	type CharacterView,
	type ChatSettings,
	replyEffortOf,
} from "@nextroom/contracts";
import { resourceTalk } from "../conversations/history";
import { generateOnce } from "../mastra";
import type { LlmConnection } from "../mastra/providers";
import { type EventChoice, type EventContext, guideOf, needsHistory } from "./events";

/** How much of the conversations a draft reads: the first talks and the latest. */
const FIRST_MESSAGES = 20;
const LAST_MESSAGES = 60;
const MESSAGE_CHARS = 300;

export interface PreparedEvent extends EventChoice {
	/** Told to the character after the conversation. */
	instruction: string;
	/** What it is about, kept so it is not repeated. */
	topic: string;
}

interface Draft {
	skip?: boolean;
	topic?: string;
	points?: string[];
	source_ids?: string[];
	from_notes?: boolean;
}

const DRAFT_INSTRUCTIONS = [
	"You plan a moment in a conversation app where a character talks with the user through a voice-call device.",
	"You get what the character should do, the character's notes on the user, earlier messages (each with an id), and topics already used.",
	"Pick what the character will bring up, using only what the notes or the messages really say. Never invent past events, promises or things the user said.",
	"Avoid the topics already used.",
	"Answer with JSON only, no markdown:",
	'{"skip": false, "topic": "a few words in Japanese", "points": ["what to say, in English, 1-3 short items"], "source_ids": ["ids of the messages it comes from"], "from_notes": false}',
	'Set "from_notes" to true when it comes from the notes. When nothing real fits, answer {"skip": true}.',
].join("\n");

function parseDraft(answer: string): Draft | null {
	const start = answer.indexOf("{");
	const end = answer.lastIndexOf("}");
	if (start < 0 || end <= start) return null;
	try {
		return JSON.parse(answer.slice(start, end + 1)) as Draft;
	} catch {
		return null;
	}
}

/** The draft of a history event, or null when nothing real fits. */
async function draftOf(
	kind: AffinityEventKind,
	c: EventContext,
	notes: string,
	resourceId: string,
	connection: LlmConnection,
	settings: ChatSettings,
	signal: AbortSignal,
): Promise<Draft | null> {
	const talk = await resourceTalk(resourceId, FIRST_MESSAGES, LAST_MESSAGES);
	const used = c.affinity.events
		.filter((e) => e.kind === kind && e.topic)
		.map((e) => e.topic)
		.slice(-20);
	const prompt = [
		`<task>\n${guideOf(kind, c)}\n</task>`,
		`<notes>\n${notes.trim() || "(none)"}\n</notes>`,
		`<messages>\n${talk
			.map(
				(m) =>
					`[${m.id}] ${new Date(m.at * 1000).toISOString().slice(0, 10)} ${m.role}: ${m.text.slice(0, MESSAGE_CHARS)}`,
			)
			.join("\n")}\n</messages>`,
		`<used_topics>\n${used.join("\n") || "(none)"}\n</used_topics>`,
	].join("\n\n");
	const draft = parseDraft(
		await generateOnce(connection, DRAFT_INSTRUCTIONS, prompt, {
			temperature: 0.7,
			effort: replyEffortOf(settings),
			signal,
		}),
	);
	if (!draft || draft.skip || !draft.topic) return null;
	const ids = new Set(talk.map((m) => m.id));
	const real = (draft.source_ids ?? []).filter((id) => ids.has(id));
	if (!real.length && !(draft.from_notes && notes.trim())) return null;
	return { ...draft, source_ids: real };
}

const DELIVERY_NOTE = {
	opening:
		"The device has just connected and the user has not said anything yet. Speak first, starting with this.",
	reply:
		"First answer what the user just said. Then, if the moment allows, bring this up naturally in the same reply. If the user is busy with something urgent or serious, leave it for another time.",
	letter:
		"The device has just connected and the user has not said anything yet. Before anything else, read aloud a letter you wrote to the user: a few short paragraphs in your own words, signed with your name. After reading it, say a word or two, shyly.",
} as const;

/** What the character is told for the event; null when a history event finds nothing real. */
export async function prepareEvent(
	choice: EventChoice,
	c: EventContext,
	character: CharacterView,
	notes: string,
	resourceId: string,
	connection: LlmConnection,
	settings: ChatSettings,
	signal: AbortSignal,
): Promise<PreparedEvent | null> {
	let topic: string = choice.label;
	let points: string[] = [];
	if (needsHistory(choice.kind)) {
		const draft = await draftOf(choice.kind, c, notes, resourceId, connection, settings, signal);
		if (!draft) return null;
		topic = draft.topic ?? topic;
		points = draft.points ?? [];
	}
	const instruction = [
		`[Something ${character.persona.name} wants to do now]`,
		guideOf(choice.kind, c),
		points.length ? `What to bring up:\n${points.map((p) => `- ${p}`).join("\n")}` : "",
		DELIVERY_NOTE[choice.delivery],
		"Keep it in character and in your own words. Never say that this was planned or that it is an event.",
	]
		.filter(Boolean)
		.join("\n");
	return { ...choice, instruction, topic };
}

/** Whether the user's words accept a confession: true, false, or null when they do not say. */
export async function confessionAnswer(
	userText: string,
	connection: LlmConnection,
	settings: ChatSettings,
	signal: AbortSignal,
): Promise<boolean | null> {
	const answer = await generateOnce(
		connection,
		'The character in a conversation app has just confessed their love to the user and asked them to go out. Read the user\'s reply and answer with one word: "yes" if they accept, "no" if they turn it down, "unclear" otherwise.',
		userText,
		{ temperature: 0, effort: replyEffortOf(settings), signal },
	);
	const word = answer.trim().toLowerCase();
	if (word.startsWith("yes")) return true;
	if (word.startsWith("no")) return false;
	return null;
}
