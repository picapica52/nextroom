// The tags an expression image can carry. `value` is stored and written by the replies
// as face tags (`[smile]`); `label` is shown.

interface ExpressionTagOption {
	label: string;
	value: string;
}

export const EXPRESSION_TAG_GROUPS = [
	{
		label: "喜び",
		tags: [
			{ label: "喜び", value: "joy" },
			{ label: "微笑み", value: "smile" },
			{ label: "わくわく", value: "excited" },
		],
	},
	{
		label: "愛情・照れ",
		tags: [
			{ label: "好き", value: "love" },
			{ label: "照れ", value: "embarrassed" },
		],
	},
	{
		label: "悲しみ",
		tags: [
			{ label: "悲しい", value: "sad" },
			{ label: "泣き", value: "crying" },
		],
	},
	{
		label: "怒り・不満",
		tags: [
			{ label: "怒り", value: "angry" },
			{ label: "イライラ", value: "annoyed" },
			{ label: "ふくれっ面", value: "pouting" },
		],
	},
	{
		label: "驚き",
		tags: [
			{ label: "驚き", value: "surprised" },
			{ label: "衝撃", value: "shocked" },
		],
	},
	{
		label: "恐れ・不安",
		tags: [
			{ label: "怖い", value: "scared" },
			{ label: "不安", value: "anxious" },
		],
	},
	{
		label: "困惑・思考",
		tags: [
			{ label: "困惑", value: "confused" },
			{ label: "困り顔", value: "troubled" },
			{ label: "考え中", value: "thinking" },
		],
	},
	{
		label: "自信・いたずら",
		tags: [
			{ label: "ドヤ顔", value: "smug" },
			{ label: "真剣", value: "serious" },
			{ label: "いたずらっぽい", value: "mischievous" },
		],
	},
	{
		label: "落ち着き・脱力",
		tags: [
			{ label: "穏やか", value: "calm" },
			{ label: "眠い", value: "sleepy" },
			{ label: "疲れ", value: "tired" },
		],
	},
] as const satisfies readonly { label: string; tags: readonly ExpressionTagOption[] }[];

const EXPRESSION_TAGS: readonly ExpressionTagOption[] = EXPRESSION_TAG_GROUPS.flatMap(
	(g): readonly ExpressionTagOption[] => g.tags,
);

export type ExpressionTag = (typeof EXPRESSION_TAG_GROUPS)[number]["tags"][number]["value"];

export const EXPRESSION_TAG_VALUES = EXPRESSION_TAGS.map((t) => t.value) as [
	ExpressionTag,
	...ExpressionTag[],
];

const VALUES = new Set<string>(EXPRESSION_TAG_VALUES);

export const isExpressionTag = (value: string): value is ExpressionTag => VALUES.has(value);

/** Tags the list had before it was narrowed down, and the tag each now reads as. */
export const MERGED_TAGS: Record<string, ExpressionTag> = {
	laugh: "joy",
	relieved: "smile",
	amazed: "excited",
	lovestruck: "love",
	clingy: "love",
	flustered: "embarrassed",
	teary: "crying",
	disappointed: "sad",
	lonely: "sad",
	melancholy: "sad",
	furious: "angry",
	frustrated: "annoyed",
	disgusted: "annoyed",
	jealous: "pouting",
	panicked: "scared",
	nervous: "anxious",
	cold_sweat: "anxious",
	bitter_smile: "troubled",
	curious: "thinking",
	suspicious: "thinking",
	proud: "smug",
	confident: "smug",
	defiant: "serious",
	grin: "mischievous",
	wink: "mischievous",
	expressionless: "calm",
	bored: "tired",
	happy: "joy",
	delighted: "joy",
	cheerful: "joy",
	satisfied: "smile",
	grateful: "smile",
	giggle: "joy",
	laughing_tears: "joy",
	energetic: "excited",
	action: "excited",
	affectionate: "love",
	tender: "love",
	blushing: "embarrassed",
	shy: "embarrassed",
	tipsy: "embarrassed",
	admiring: "love",
	depressed: "sad",
	hurt: "sad",
	dejected: "sad",
	regretful: "sad",
	sobbing: "crying",
	nostalgic: "sad",
	indignant: "angry",
	irritated: "annoyed",
	grumpy: "annoyed",
	sulky: "pouting",
	scornful: "annoyed",
	startled: "surprised",
	astonished: "shocked",
	dumbfounded: "shocked",
	impressed: "excited",
	terrified: "scared",
	cowering: "scared",
	worried: "anxious",
	uneasy: "anxious",
	timid: "anxious",
	puzzled: "confused",
	wondering: "confused",
	awkward: "troubled",
	hesitant: "troubled",
	pained: "troubled",
	doubtful: "thinking",
	cool: "smug",
	determined: "serious",
	playful: "mischievous",
	teasing: "mischievous",
	scheming: "mischievous",
	goofy: "mischievous",
	peaceful: "calm",
	relaxed: "calm",
	exhausted: "tired",
	sighing: "tired",
	sick: "tired",
	indifferent: "tired",
	dazed: "calm",
	forced_smile: "troubled",
};

/** A stored tag as one of the list: merged ones as the tag they were merged into, others empty. */
export const currentExpressionTag = (value: string): ExpressionTag | "" =>
	isExpressionTag(value) ? value : (MERGED_TAGS[value] ?? "");

/** The Japanese label of a tag; empty for one that is not in the list. */
export const expressionTagLabel = (value: string): string =>
	EXPRESSION_TAGS.find((t) => t.value === value)?.label ?? "";
