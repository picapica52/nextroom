import { startRoutines } from "./agent/routines";
import { runRoutineTurn } from "./conversations/turn";
import { restartDiscordBot } from "./discord/bot";
import { type ApiConfig, configure as configureDataDir } from "./lib/config";
import { restartSlackBot } from "./slack/bot";

export type { ApiConfig };

/** Point the app at its data folder (conversations, characters, settings, the agent's memory),
 *  start the routines, and connect the Discord and Slack bots when they are turned on. */
export function configure(config: ApiConfig): void {
	configureDataDir(config);
	startRoutines(runRoutineTurn);
	void restartDiscordBot();
	void restartSlackBot();
}
export {
	type DesktopSocketData,
	desktopSocket,
	upgradeDesktopSocket,
} from "./agent/tools/desktop";
export { type AppType, apiRouter } from "./routes";
