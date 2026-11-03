import { startRoutines } from "./agent/routines";
import { migrateLegacyFaces } from "./characters/store";
import { runRoutineTurn } from "./conversations/turn";
import { restartDiscordBot } from "./discord/bot";
import { type ApiConfig, configure as configureDataDir } from "./lib/config";

export type { ApiConfig };

/** Point the app at its data folder (conversations, characters, settings, the agent's memory),
 *  start the routines, and log the Discord bot in when it is turned on. */
export function configure(config: ApiConfig): void {
	configureDataDir(config);
	migrateLegacyFaces();
	startRoutines(runRoutineTurn);
	void restartDiscordBot();
}
export {
	type DesktopSocketData,
	desktopSocket,
	upgradeDesktopSocket,
} from "./agent/tools/desktop";
export { type AppType, apiRouter } from "./routes";
