import { AudioLines, Brain, type LucideIcon, Smile, UserRound } from "lucide-react";

export const TABS = [
	{ id: "profile", label: "プロフィール" },
	{ id: "voice", label: "声" },
	{ id: "expressions", label: "表情" },
	{ id: "memory", label: "記憶" },
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
	expressions: {
		icon: Smile,
		summary: "アイコンと通話で切り替える顔",
		description: "通話中、セリフに合わせてアイコンを切り替えます",
	},
	memory: {
		icon: Brain,
		summary: "好感度・ワーキングメモリー",
		description: "会話の中で自動で更新され、ここで直せます",
	},
};

/** Tabs whose fields are saved together with the save bar. */
export const EDIT_TABS: Tab[] = ["profile"];
