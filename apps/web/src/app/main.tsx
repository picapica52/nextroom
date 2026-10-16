import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "../index.css";

const element = document.getElementById("root");
if (!element) throw new Error("Root element not found");

createRoot(element).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
