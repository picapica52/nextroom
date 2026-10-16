import { Outlet } from "react-router-dom";
import ChatPage from "@/features/chat/components/chat-page";

/** The conversation fills the window; the characters and the settings open over it. */
export function Layout() {
	return (
		<main className="h-full">
			<ChatPage />
			<Outlet />
		</main>
	);
}
