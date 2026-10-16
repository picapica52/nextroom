// The background color of the call screen, by the group of the shown face's tag.

import { EXPRESSION_TAG_GROUPS, type Expression } from "@nextroom/contracts";

type TagGroup = (typeof EXPRESSION_TAG_GROUPS)[number]["label"];

const MOOD: Record<TagGroup, string> = {
	喜び: "var(--pastel-yellow)",
	"愛情・照れ": "var(--pastel-peach)",
	悲しみ: "#c3c8e0",
	"怒り・不満": "#ffb0a3",
	驚き: "var(--pastel-sky)",
	"恐れ・不安": "#c9cfe6",
	"困惑・思考": "var(--pastel-mint)",
	"自信・いたずら": "#c4b8f0",
	"落ち着き・脱力": "var(--pastel-mint)",
};

export function moodColor(expression: Expression | undefined): string | undefined {
	const tag = expression?.tag;
	if (!tag) return undefined;
	const group = EXPRESSION_TAG_GROUPS.find((g) =>
		g.tags.some((t: { value: string }) => t.value === tag),
	)?.label;
	return group && MOOD[group];
}
