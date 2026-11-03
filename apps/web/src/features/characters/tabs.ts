import {
	AudioLines,
	Brain,
	CalendarClock,
	type LucideIcon,
	SlidersHorizontal,
	UserRound,
} from "lucide-react";

export const TABS = [
	{ id: "profile", label: "プロフィール" },
	{ id: "voice", label: "声" },
	{ id: "memory", label: "記憶" },
	{ id: "routines", label: "ルーティン" },
	{ id: "agent", label: "詳細" },
] as const;

export type Tab = (typeof TABS)[number]["id"];

/** The icon, the line under the name in the list, and the line under the heading of each tab. */
export const TAB_INFO: Record<Tab, { icon: LucideIcon; summary: string; description: string }> = {
	profile: {
		icon: UserRound,
		summary: "名前・世界観・性格・喋り方",
		description: "会話のシステムプロンプトに組み込まれます",
	},
	voice: {
		icon: AudioLines,
		summary: "モデル・参照音声・試聴",
		description: "このキャラクターの返答に使う声",
	},
	memory: {
		icon: Brain,
		summary: "好感度・メモ",
		description: "会話の中で自動で更新され、ここで直せます",
	},
	routines: {
		icon: CalendarClock,
		summary: "決まった時間に自分で動く",
		description: "指示を決まった時間に実行し、結果を会話に残します",
	},
	agent: {
		icon: SlidersHorizontal,
		summary: "モデル・ツール・指示",
		description: "このキャラクターだけに使う設定です",
	},
};

/** Tabs whose fields are saved together with the save bar. */
export const EDIT_TABS: Tab[] = ["profile"];
