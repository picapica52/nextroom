import { restartDiscordBot } from "./discord/bot";
import { type ApiConfig, configure as configureDataDir } from "./lib/config";

export type { ApiConfig };

/** Point the app at its data folder (conversations, characters, settings, the agent's memory),
 *  and log the Discord bot in when it is turned on. */
export function configure(config: ApiConfig): void {
	configureDataDir(config);
	void restartDiscordBot();
}
export { type AppType, apiRouter } from "./routes";
