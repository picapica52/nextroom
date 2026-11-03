// The affinity's part in a turn: what the character is told of the relationship and of an event
// it starts, before the reply; the exchange counted and the event noted, after it.

import type { CharacterView, ChatAffinityMark, EventDelivery } from "@nextroom/contracts";
import type { Connections } from "../agent/llm";
import { readNotes } from "../agent/memory";
import { otherCharactersTalks } from "../conversations/sessions";
import { confessionAnswer, type PreparedEvent, prepareEvent } from "./draft";
import { chooseEvent, type EventChoice, type EventContext, parseNotes } from "./events";
import { relationshipNote } from "./prompt";
import { answerConfession, loadAffinity, longingOf, recordEvent, recordExchange } from "./store";

/** A confession not answered within this long is let go (they stay friends). */
const CONFESSION_WAIT_SECONDS = 24 * 60 * 60;

/** Said to the character when it opens the conversation without an event to start. */
const PLAIN_OPENING =
	"The device has just connected and the user has not said anything yet. Speak first: greet them as fits how close you are.";

/** The words a reply the character opens with answers; they are not shown. */
export const OPENING_TRIGGER = "（端末がつながった）";

async function contextOf(character: CharacterView, spoken: boolean) {
	const affinity = loadAffinity(character.id);
	const today = new Date();
	const notes = readNotes(character.id);
	const context: EventContext = {
		affinity,
		now: today,
		spoken,
		longing: longingOf(affinity, today),
		notes: parseNotes(notes),
		otherTalks: otherCharactersTalks(character.id, affinity.last_at ?? Number.POSITIVE_INFINITY),
	};
	return { context, notes };
}

/** The event the character opens a conversation with, if one is due. */
export async function openingEvent(character: CharacterView): Promise<EventChoice | null> {
	const deliveries: EventDelivery[] = ["opening", "letter"];
	return chooseEvent((await contextOf(character, false)).context, deliveries);
}

export interface AffinityTurn {
	/** Added to the post-history instructions. */
	note: string;
	event: PreparedEvent | null;
}

/** Before the reply: the user's answer to a confession, the relationship, and an event to start
 *  (`opening` when the character opens the conversation). */
export async function prepareAffinityTurn(options: {
	character: CharacterView;
	userText: string;
	opening: EventChoice | null;
	/** No one is there (a routine's run): no confession is answered and no event starts. */
	quiet?: boolean;
	/** The user said it aloud. */
	spoken: boolean;
	connection: Connections;
	signal: AbortSignal;
}): Promise<AffinityTurn> {
	const { character, opening, connection, signal } = options;
	const confessed = loadAffinity(character.id).confessed_at;
	if (!opening && !options.quiet && confessed !== null) {
		const accepted = await confessionAnswer(options.userText, connection, signal).catch(() => null);
		if (accepted !== null) answerConfession(character.id, accepted);
		else if (Date.now() / 1000 - confessed > CONFESSION_WAIT_SECONDS)
			answerConfession(character.id, false);
	}
	const { context, notes } = await contextOf(character, options.spoken);
	const choice = opening ?? (options.quiet ? null : chooseEvent(context, ["reply"]));
	const event = choice
		? await prepareEvent(choice, context, character, notes, connection, signal).catch((error) => {
				console.warn(`Could not prepare the event ${choice.kind}:`, error);
				return null;
			})
		: null;
	return {
		note: [
			relationshipNote(character, context.affinity, context.longing),
			event?.instruction ?? (opening ? PLAIN_OPENING : ""),
		]
			.filter(Boolean)
			.join("\n\n"),
		event,
	};
}

/** After the reply: the event noted, and the exchange counted (not when the character opened
 *  the conversation). Returns what the reply carries. */
export function finishAffinityTurn(options: {
	character: CharacterView;
	opened: boolean;
	spoken: boolean;
	tools: "none" | "ok" | "error";
	event: PreparedEvent | null;
	reply: string;
}): ChatAffinityMark {
	const { character, event } = options;
	const mark: ChatAffinityMark = {};
	if (event) {
		recordEvent(character.id, {
			kind: event.kind,
			topic: event.topic,
			levelEvent: event.levelEvent,
			...(event.delivery === "letter" ? { letter: options.reply } : {}),
		});
		mark.event = { kind: event.kind, label: event.label };
	}
	if (!options.opened) {
		const { levelUp } = recordExchange(character.id, options.spoken, options.tools, !!event);
		if (levelUp) mark.level_up = levelUp;
	}
	return mark;
}
