import { createBrowserRouter, Navigate } from "react-router-dom";
import { Layout } from "@/components/layout";
import CharacterDialog from "@/features/characters/components/character-dialog";
import ApprovalSettings from "@/features/settings/components/approval-settings";
import ConnectionSettings from "@/features/settings/components/connection-settings";
import DiscordSettings from "@/features/settings/components/discord-settings";
import GeneralSettings from "@/features/settings/components/general-settings";
import ModelSettings from "@/features/settings/components/model-settings";
import SettingsDialog from "@/features/settings/components/settings-dialog";
import SlackSettings from "@/features/settings/components/slack-settings";
import ToolSettings from "@/features/settings/components/tool-settings";
import VoiceSettings from "@/features/settings/components/voice-settings";

export const router = createBrowserRouter([
	{
		element: <Layout />,
		children: [
			{ path: "/", element: <Navigate to="/chat" replace /> },
			{ path: "/chat", element: null },
			{ path: "/chat/:sessionId", element: null },
			{ path: "/characters/:id", element: <CharacterDialog /> },
			{ path: "/characters/:id/:tab", element: <CharacterDialog /> },
			{
				path: "/settings",
				element: <SettingsDialog />,
				children: [
					{ path: "general", element: <GeneralSettings /> },
					{ path: "connections", element: <ConnectionSettings /> },
					{ path: "models", element: <ModelSettings /> },
					{ path: "voice", element: <VoiceSettings /> },
					{ path: "tools", element: <ToolSettings /> },
					{ path: "approvals", element: <ApprovalSettings /> },
					{ path: "discord", element: <DiscordSettings /> },
					{ path: "slack", element: <SlackSettings /> },
					{ path: "*", element: <Navigate to="/settings/general" replace /> },
				],
			},
			{ path: "*", element: <Navigate to="/chat" replace /> },
		],
	},
]);
