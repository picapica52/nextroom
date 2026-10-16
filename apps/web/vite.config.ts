import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Where the API server listens in development; the built app is served by it. */
const API = process.env.VITE_SERVER_URL || "http://127.0.0.1:8767";

export default defineConfig({
	server: {
		// Reachable from other devices on the local network, over HTTPS (a self-signed certificate)
		// since browsers give the microphone only to HTTPS pages.
		host: "0.0.0.0",
		port: 5175,
		proxy: {
			"/api": { target: API, changeOrigin: false },
		},
	},
	resolve: {
		tsconfigPaths: true,
	},
	plugins: [tailwindcss(), react(), basicSsl({ name: "Nextroom" })],
});
