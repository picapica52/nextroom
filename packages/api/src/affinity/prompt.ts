// What the character is told of how close the two are, after the conversation: the level as
// words (never the points), how it shows in speech and in the voice, the relationship, and how
// much it missed the user. The faces of affection come only as the two grow close.

import type { Affinity, CharacterView } from "@nextroom/contracts";

/** How the character is at each level, as friends. */
const FRIEND_LEVELS = [
	"You met only recently through the devices. Be polite and a little guarded, still unsure what to make of this stranger on the other end. In your voice, stay a little formal and listen to the user carefully.",
	"You have talked a few times. You are warming up to the user but still hold back a little. In your voice, sound at ease but not yet familiar.",
	"You are friends. Joke, say what you really think, and bring up topics yourself. In your voice, sound relaxed when the device connects.",
	"You are close friends. Care for the user and lean on them a little without thinking about it, and call them by their name or a nickname. In your voice, sound glad from the first word when it connects, and answer quickly.",
	"The user is someone special to you: you trust them deeply and are fond of them, and you look forward to the device connecting. In your voice, let it show plainly that you are glad to hear them.",
];

/** The top levels once the two are lovers. */
const LOVER_LEVELS: Record<number, string> = {
	4: "You and the user are lovers now, and it still makes you a little shy. Let your affection show, and be shy about it. In your voice, go soft and trail off when you are embarrassed.",
	5: "You and the user are lovers who trust each other. Show your affection and lean on them openly. In your voice, speak softly and close, as if you could reach through the device.",
};

/** Friends at the top levels: the feeling has started to show. */
const ROMANCE_HINT =
	"You have started to feel more than friendship for the user, though you have not said so. It may slip out now and then.";

/** How much the character missed the user since they last talked, from the highest. */
const LONGING_NOTES: [number, string][] = [
	[
		80,
		"You missed the user very much since you last talked, and your joy at hearing them again shows.",
	],
	[50, "You missed the user since you last talked, and you are glad to hear from them again."],
	[20, "You missed the user a little since you last talked."],
];

/** Faces that come only from this level on (as friends). */
const FACE_LEVELS: Record<string, number> = { embarrassed: 3, love: 4 };

/** The faces the character may make at this affinity; all of them for lovers. */
export function allowedFaces(tags: string[], affinity: Affinity): string[] {
	if (affinity.relationship === "lover") return tags;
	return tags.filter((tag) => (FACE_LEVELS[tag] ?? 1) <= affinity.level);
}

/** The relationship part of the post-history instructions. */
export function relationshipNote(
	character: CharacterView,
	affinity: Affinity,
	longing: number,
): string {
	const { level } = affinity;
	const lover = affinity.relationship === "lover";
	const description = (lover && LOVER_LEVELS[level]) || FRIEND_LEVELS[level - 1] || "";
	return [
		"[Relationship]",
		`How close ${character.persona.name} feels to the user now: level ${level} of 5${lover ? ", lovers" : ""}.`,
		description,
		!lover && level >= 4 ? ROMANCE_HINT : "",
		LONGING_NOTES.find(([from]) => longing >= from)?.[1] ?? "",
		"Let this show in how you talk. Never mention levels, points or numbers about it, and never act closer than this.",
	]
		.filter(Boolean)
		.join("\n");
}
