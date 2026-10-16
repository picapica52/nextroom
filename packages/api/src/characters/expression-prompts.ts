// What each expression tag looks like: the eyes, eyebrows, mouth and cheeks the image model
// draws (instead of the tag's bare name, which it tends to ignore), and the criteria the
// Decisions API tags an image by.

import type { ExpressionTag } from "@nextroom/contracts";

/** The neutral face, drawn when no feeling shows; not a tag the Decisions API chooses. */
export const NEUTRAL_PROMPT =
	"neutral: an ordinary relaxed face, eyes open looking at the viewer, relaxed eyebrows, mouth gently closed, no blush or emotion marks";

export const EXPRESSION_PROMPTS: Record<ExpressionTag, string> = {
	joy: "overjoyed: eyes closed in happy upward arcs, wide open smiling mouth, cheeks lifted with a light pink blush",
	smile: "gentle smile: soft relaxed eyes, relaxed eyebrows, lips closed in a calm warm smile",
	excited:
		"excited: wide sparkling eyes with star-shaped highlights, raised eyebrows, big open smile, leaning forward eagerly",
	love: "loving: soft adoring eyes looking at the viewer, gentle warm smile, light pink blush, a small heart symbol near the face",
	embarrassed:
		"embarrassed: light pink blush on the cheeks, eyebrows raised and drawn together, eyes looking away to the side, mouth closed in a small wavy line",
	sad: "sad: eyebrows slanted up in the middle, downcast eyes, mouth turned down, no tears",
	crying:
		"crying: tears streaming down both cheeks, wet squeezed eyes, eyebrows knitted upward, mouth open and trembling",
	angry:
		"angry: eyebrows sharply furrowed toward the nose, glaring eyes, mouth open showing clenched teeth, an anger mark on the forehead",
	annoyed:
		"annoyed: narrowed eyes, one eyebrow twitching down, mouth pressed into a tight line, a small anger mark",
	pouting:
		"pouting: puffed-out cheeks, lips pushed forward, lowered eyebrows, a sulky sideways glare",
	surprised:
		"surprised: eyes wide open with small pupils, eyebrows raised high, mouth open in a small round O",
	shocked:
		"shocked: huge blank eyes, eyebrows shot up, jaw dropped wide open, pale face with vertical shadow lines",
	scared:
		"scared: wide trembling eyes with small pupils, eyebrows raised and drawn together, shaky open mouth, pale face, hunched shoulders",
	anxious:
		"anxious: worried eyes glancing aside, eyebrows tilted up in the middle, tight lips, a sweat drop, hands clutched together",
	confused:
		"confused: head tilted, one eyebrow raised and the other lowered, mouth slightly open, a question mark beside the head",
	troubled:
		"troubled: eyebrows slanted up in the middle, an awkward strained smile, a sweat drop, a hand scratching the cheek",
	thinking:
		"thinking: eyes looking up to the side, a finger on the chin, pursed lips, slightly furrowed eyebrows",
	serious:
		"serious: firm focused eyes, straight slightly lowered eyebrows, mouth closed in a firm line",
	smug: "smug: half-lidded eyes, raised eyebrows, wide self-satisfied closed smile, chin raised, a small sparkle",
	mischievous:
		"mischievous: playful narrowed eyes, a sly grin showing a small fang, a finger near the lips",
	calm: "calm: relaxed half-closed eyes, neutral eyebrows, a faint peaceful smile",
	sleepy: "sleepy: droopy barely open eyes, a small yawn, rubbing one eye, head tilting",
	tired:
		"tired: heavy-lidded eyes with dark circles, drooping eyebrows, mouth slightly open exhaling, slumped shoulders",
};
