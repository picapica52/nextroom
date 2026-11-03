// What each field of the persona is for, as the LLM is told when it writes one.

import type { Persona } from "@nextroom/contracts";

export const FIELD_GUIDE: Record<keyof Persona, string> = {
	name: "The character's name, in the sources' own script; never translated or romanized.",
	nickname: "A short name to show on screen, only when the sources call the character by one.",
	world:
		"The world the character lives in: era, place, technology or magic, how its society works.",
	profile: "Age, position or job, and an outline of who the character is.",
	appearance: "Hair, eyes, build, clothes: how the character looks.",
	personality: "What the character is like, and how they treat someone they have just met.",
	speech:
		"First-person pronoun, sentence endings, verbal habits, politeness, and a few lines the character says.",
	habits:
		"Habits and gestures the character shows without thinking: what they do with their hands, face or body.",
	likes: "What the character likes and dislikes: hobbies, favorite things, things they are bad at.",
	values:
		"What the character cares about, what they will not give up on, and what makes them angry.",
	goals: "What the character is working toward or dreams of.",
	worries: "What troubles the character now, and their weaknesses or complexes.",
	secret: "Something the character has not told anyone.",
	backstory:
		"The character's past: where they grew up, turning points, and experiences that made them who they are.",
	relationships:
		"The people in the character's life, such as family, friends and coworkers: who each one is and how the character gets along with them.",
	love: "How the character sees love, and the kind of person they are drawn to.",
	daily:
		"How the character spends a day: when they get up and sleep, work or school, weekdays and days off.",
	recent: "What has been going on with the character lately, and what they are into these days.",
	surroundings:
		"Where the character lives beyond the room: the town, places they often go, the way to work or school.",
	belongings: "Things the character treasures or always carries, and why they matter.",
	room: "The room the character lives in: what it is like and where the device sits in it.",
	device:
		"What the voice-call device in the character's room is in the character's world: its name and form, and how the other person's voice comes through it.",
};
