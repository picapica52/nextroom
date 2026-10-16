import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { ConfirmProvider } from "@/components/confirm";
import { router } from "./router";

const queryClient = new QueryClient({
	defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

export function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<ConfirmProvider>
				<RouterProvider router={router} />
			</ConfirmProvider>
		</QueryClientProvider>
	);
}
