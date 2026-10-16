// What the character is told of how close the two are, after the conversation: the level as
// words (never the points), how it shows in speech and on the screen, the relationship, and how
// much it missed the user. The faces of affection come only as the two grow close.

import type { Affinity, CharacterView } from "@nextroom/contracts";

/** How the character is at each level, as friends. */
const FRIEND_LEVELS = [
	"You met only recently through the devices. Be polite and a little guarded, still unsure what to make of this stranger on the screen. On the screen, keep some distance from the device and watch the user carefully.",
	"You have talked a few times. You are warming up to the user but still hold back a little. On the screen, sit at an ordinary distance from the device.",
	"You are friends. Joke, say what you really think, and bring up topics yourself. On the screen, look relaxed when the device connects.",
	"You are close friends. Care for the user and lean on them a little without thinking about it, and call them by their name or a nickname. On the screen, lean toward the device and come to it quickly when it connects.",
	"The user is someone special to you: you trust them deeply and are fond of them, and you look forward to the device connecting. On the screen, sit close to the device and show plainly that you are glad to see them.",
];

/** The top levels once the two are lovers. */
const LOVER_LEVELS: Record<number, string> = {
	4: "You and the user are lovers now, and it still makes you a little shy. Let your affection show, and be shy about it. On the screen, sit close to the device and glance away when you are embarrassed.",
	5: "You and the user are lovers who trust each other. Show your affection and lean on them openly. On the screen, stay close to the device as if you could reach through it.",
};

/** Friends at the top levels: the feeling has started to show. */
const ROMANCE_HINT =
	"You have started to feel more than friendship for the user, though you have not said so. It may slip out now and then.";

/** How much the character missed the user since they last talked, from the highest. */
const LONGING_NOTES: [number, string][] = [
	[
		80,
		"You missed the user very much since you last talked, and your joy at seeing them again shows.",
	],
	[50, "You missed the user since you last talked, and you are glad to see them again."],
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
		"Let this show in how you talk and in the narration. Never mention levels, points or numbers about it, and never act closer than this.",
	]
		.filter(Boolean)
		.join("\n");
}
