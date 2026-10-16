import { createBrowserRouter, Navigate } from "react-router-dom";
import { Layout } from "@/components/layout";
import CharacterDialog from "@/features/characters/components/character-dialog";
import AgentSettings from "@/features/settings/components/agent-settings";
import ConnectionSettings from "@/features/settings/components/connection-settings";
import DiscordSettings from "@/features/settings/components/discord-settings";
import ModelSettings from "@/features/settings/components/model-settings";
import PromptSettings from "@/features/settings/components/prompt-settings";
import ReplySettings from "@/features/settings/components/reply-settings";
import SettingsDialog from "@/features/settings/components/settings-dialog";

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
					{ index: true, element: <Navigate to="/settings/connections" replace /> },
					{ path: "connections", element: <ConnectionSettings /> },
					{ path: "models", element: <ModelSettings /> },
					{ path: "reply", element: <ReplySettings /> },
					{ path: "prompt", element: <PromptSettings /> },
					{ path: "tools", element: <AgentSettings /> },
					{ path: "discord", element: <DiscordSettings /> },
				],
			},
			{ path: "*", element: <Navigate to="/chat" replace /> },
		],
	},
]);
