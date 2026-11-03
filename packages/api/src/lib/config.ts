// Filesystem layout shared by every module:
//
//     nextroom.sqlite      the settings, the characters, their conversations and memory, and the
//                          subscriptions' credentials (lib/db.ts)
//     characters/<id>/     a character's images, voice files and workspace (characters/store.ts)
//     uploads/             audio uploaded before it joins a character's voice (engine/uploads.ts)
//     tls/                 the self-signed certificate of the HTTPS port (apps/server)

import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export interface ApiConfig {
	/** `_data/` of the repository unless set otherwise. */
	dataDir: string;
}

let current: ApiConfig | null = null;

export function configure(config: ApiConfig): void {
	current = { dataDir: resolve(config.dataDir) };
	for (const dir of [charactersDir(), uploadsDir()]) mkdirSync(dir, { recursive: true });
}

function config(): ApiConfig {
	if (!current) throw new Error("configure() has not been called");
	return current;
}

export const dataDir = () => config().dataDir;
export const charactersDir = () => join(dataDir(), "characters");
/** Audio uploaded from the browser, before it joins a character's voice. */
export const uploadsDir = () => join(dataDir(), "uploads");
