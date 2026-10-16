// Filesystem layout shared by every module:
//
//     settings.json        the settings (settings/file.ts)
//     characters/<id>/     a character, its one conversation and its workspace (characters/store.ts)
//     agent/memory.db      Mastra's memory: the conversations' messages and what they recall
//     uploads/             audio uploaded before it joins a character's voice (engine/uploads.ts)
//     transformers/        the models Transformers.js downloads on first use
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
	for (const dir of [charactersDir(), agentDir(), uploadsDir()])
		mkdirSync(dir, { recursive: true });
}

function config(): ApiConfig {
	if (!current) throw new Error("configure() has not been called");
	return current;
}

export const dataDir = () => config().dataDir;
export const charactersDir = () => join(dataDir(), "characters");
const agentDir = () => join(dataDir(), "agent");
/** Mastra's storage: memory threads, messages, working memory and recall vectors. */
export const memoryDbUrl = () => `file:${join(agentDir(), "memory.db")}`;
/** Audio uploaded from the browser, before it joins a character's voice. */
export const uploadsDir = () => join(dataDir(), "uploads");
/** Transformers.js's cache of the models it downloads on first use (embedder, cutout). */
export const modelCacheDir = () => join(dataDir(), "transformers");
