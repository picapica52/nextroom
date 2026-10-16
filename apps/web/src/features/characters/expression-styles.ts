import type { ExpressionStyle } from "@nextroom/contracts";

export const EXPRESSION_STYLE_OPTIONS = [
	{
		value: "bust",
		label: "上半身",
		badge: "AI 上半身",
		note: "胸から上・正面。顔の位置がそろうので通話画面で切り替えても揺れにくい",
	},
	{
		value: "chibi",
		label: "ちびキャラ",
		badge: "AI ちび",
		note: "2頭身の全身。表情を大げさにして、汗・怒りマークなどの記号も使う",
	},
] as const satisfies readonly { value: ExpressionStyle; [key: string]: string }[];

export const expressionStyleBadge = (style: ExpressionStyle) =>
	EXPRESSION_STYLE_OPTIONS.find((o) => o.value === style)?.badge ?? "AI 生成";
