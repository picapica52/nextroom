import { createBrowserRouter, Navigate } from "react-router-dom";
import { Layout } from "@/components/layout";
import CharacterDialog from "@/features/characters/components/character-dialog";
import ApprovalSettings from "@/features/settings/components/approval-settings";
import ComputerSettings from "@/features/settings/components/computer-settings";
import GeneralSettings from "@/features/settings/components/general-settings";
import IntegrationSettings from "@/features/settings/components/integration-settings";
import MessagingSettings from "@/features/settings/components/messaging-settings";
import ModelSettings from "@/features/settings/components/model-settings";
import SettingsDialog from "@/features/settings/components/settings-dialog";
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
					{ index: true, element: <Navigate to="/settings/general" replace /> },
					{ path: "general", element: <GeneralSettings /> },
					{ path: "models", element: <ModelSettings /> },
					{ path: "voice", element: <VoiceSettings /> },
					{ path: "approvals", element: <ApprovalSettings /> },
					{ path: "messaging", element: <MessagingSettings /> },
					{ path: "computer", element: <ComputerSettings /> },
					{ path: "integrations", element: <IntegrationSettings /> },
				],
			},
			{ path: "*", element: <Navigate to="/chat" replace /> },
		],
	},
]);
