import {
	Cpu,
	Hash,
	Headphones,
	KeyRound,
	type LucideIcon,
	Settings,
	ShieldCheck,
	Volume2,
	Wrench,
} from "lucide-react";

export type SettingsPageId =
	| "general"
	| "connections"
	| "models"
	| "voice"
	| "tools"
	| "approvals"
	| "discord"
	| "slack";

export type SettingsPage = {
	id: SettingsPageId;
	label: string;
	description: string;
	icon: LucideIcon;
	group: string;
};

export const SETTINGS_PAGES: SettingsPage[] = [
	{
		id: "general",
		label: "一般",
		description: "あなたの名前と、すべてのキャラクターへの指示",
		icon: Settings,
		group: "はじめに",
	},
	{
		id: "connections",
		label: "接続",
		description: "AI・音声・Web のサービスのアカウントと API キー",
		icon: KeyRound,
		group: "はじめに",
	},
	{
		id: "models",
		label: "モデル",
		description: "会話に使うモデルと、失敗したときの代わり",
		icon: Cpu,
		group: "はじめに",
	},
	{
		id: "voice",
		label: "音声",
		description: "返答の読み上げと、話した声の文字起こし",
		icon: Volume2,
		group: "はじめに",
	},
	{
		id: "tools",
		label: "道具",
		description: "キャラクターが使える Web 検索・アプリ・コンピューター",
		icon: Wrench,
		group: "キャラクターの行動",
	},
	{
		id: "approvals",
		label: "承認",
		description: "キャラクターが操作する前に確認するかどうか",
		icon: ShieldCheck,
		group: "キャラクターの行動",
	},
	{
		id: "discord",
		label: "Discord",
		description: "Discord のボイスチャンネルでキャラクターと話す",
		icon: Headphones,
		group: "ほかの場所で話す",
	},
	{
		id: "slack",
		label: "Slack",
		description: "Slack でキャラクターにメッセージを送る",
		icon: Hash,
		group: "ほかの場所で話す",
	},
];

export const settingsPath = (page: SettingsPageId, anchor?: string) =>
	`/settings/${page}${anchor ? `#${anchor}` : ""}`;

/** One setting the search finds: where it is, and the other words it goes by. */
type SettingsEntry = { label: string; page: SettingsPageId; anchor: string; keywords?: string };

const ENTRIES: SettingsEntry[] = [
	{ label: "あなたの名前", page: "general", anchor: "user-name", keywords: "ユーザー名 user" },
	{
		label: "すべてのキャラクターへの指示",
		page: "general",
		anchor: "custom-prompt",
		keywords: "プロンプト システム カスタム prompt",
	},
	{
		label: "Anthropic（Claude）",
		page: "connections",
		anchor: "provider-anthropic",
		keywords: "claude サブスク サインイン api キー",
	},
	{
		label: "OpenAI（ChatGPT）",
		page: "connections",
		anchor: "provider-openai",
		keywords: "chatgpt gpt サブスク サインイン api キー",
	},
	{ label: "OpenRouter", page: "connections", anchor: "provider-openrouter", keywords: "api キー" },
	{
		label: "Google（Gemini）",
		page: "connections",
		anchor: "provider-google",
		keywords: "gemini api キー",
	},
	{
		label: "xAI（Grok）",
		page: "connections",
		anchor: "provider-xai",
		keywords: "grok supergrok サブスク サインイン api キー",
	},
	{
		label: "GitHub Copilot",
		page: "connections",
		anchor: "provider-github-copilot",
		keywords: "サインイン",
	},
	{
		label: "OpenAI 互換（Ollama・LM Studio）",
		page: "connections",
		anchor: "openai_compatible_url",
		keywords: "ローカル local llm url",
	},
	{
		label: "ほかのプロバイダー",
		page: "connections",
		anchor: "more-providers",
		keywords: "groq mistral deepseek bedrock azure together その他 api キー",
	},
	{
		label: "speech.cpp サーバー",
		page: "connections",
		anchor: "speech_url",
		keywords: "音声 url 読み上げ 文字起こし",
	},
	{ label: "ElevenLabs", page: "connections", anchor: "elevenlabs_key", keywords: "音声 api キー" },
	{ label: "Fish Audio", page: "connections", anchor: "fish_audio_key", keywords: "音声 api キー" },
	{ label: "Exa（Web 検索）", page: "connections", anchor: "exa_key", keywords: "api キー" },
	{
		label: "Composio",
		page: "connections",
		anchor: "composio_key",
		keywords: "アプリ連携 api キー",
	},
	{ label: "メインモデル", page: "models", anchor: "main-model", keywords: "llm 思考" },
	{ label: "フォールバック", page: "models", anchor: "fallbacks", keywords: "予備 代わり" },
	{
		label: "画像の生成",
		page: "models",
		anchor: "image-model",
		keywords: "画像 写真 openrouter",
	},
	{ label: "温度", page: "models", anchor: "llm-temperature", keywords: "temperature" },
	{ label: "最大トークン数", page: "models", anchor: "llm-max-tokens", keywords: "max tokens" },
	{ label: "返答を読み上げる", page: "voice", anchor: "tts-enabled", keywords: "tts 音声合成" },
	{
		label: "文字起こし",
		page: "voice",
		anchor: "stt",
		keywords: "音声認識 asr stt マイク",
	},
	{ label: "Web 検索", page: "tools", anchor: "web-search-enabled", keywords: "exa" },
	{ label: "話題さがし", page: "tools", anchor: "topic-search-enabled" },
	{
		label: "アプリ連携（Gmail・Google カレンダーなど）",
		page: "tools",
		anchor: "composio-enabled",
		keywords: "composio",
	},
	{ label: "コマンドの制限時間", page: "tools", anchor: "timeout", keywords: "タイムアウト" },
	{
		label: "コンピューター（Docker）",
		page: "tools",
		anchor: "computer-enabled",
		keywords: "コンテナ メモリ cpu デスクトップ 画面 操作 ファイル コマンド シェル",
	},
	{ label: "選択肢を出す", page: "tools", anchor: "ask-user-enabled" },
	{ label: "写真を送る", page: "tools", anchor: "send-photo-enabled", keywords: "画像 自撮り" },
	{ label: "ルーティン", page: "tools", anchor: "routines-enabled", keywords: "定期 スケジュール" },
	{ label: "操作の前に確認", page: "approvals", anchor: "approval-mode", keywords: "自動" },
	{ label: "承認モデル", page: "approvals", anchor: "approval-model" },
	{ label: "許可・ブロック", page: "approvals", anchor: "approval-rules", keywords: "常に許可" },
	{ label: "Discord に接続する", page: "discord", anchor: "discord-enabled", keywords: "bot" },
	{ label: "Discord のトークン", page: "discord", anchor: "discord-token" },
	{ label: "Discord で話すキャラクター", page: "discord", anchor: "discord-character" },
	{ label: "参加したときに話しかける", page: "discord", anchor: "discord-greet" },
	{ label: "話の区切り", page: "discord", anchor: "discord-silence", keywords: "無音" },
	{ label: "Slack に接続する", page: "slack", anchor: "slack-enabled", keywords: "bot" },
	{ label: "Slack のトークン", page: "slack", anchor: "slack-bot-token", keywords: "xoxb xapp" },
	{ label: "Slack で話すキャラクター", page: "slack", anchor: "slack-character" },
];

const fold = (s: string) =>
	s
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** The settings whose name or other words hold every word of the query. */
export function searchSettings(query: string) {
	const words = fold(query).split(/\s+/).filter(Boolean);
	if (!words.length) return [];
	return ENTRIES.filter((e) => {
		const page = SETTINGS_PAGES.find((p) => p.id === e.page);
		const text = fold(`${e.label} ${e.keywords ?? ""} ${page?.label ?? ""}`);
		return words.every((w) => text.includes(w));
	});
}
