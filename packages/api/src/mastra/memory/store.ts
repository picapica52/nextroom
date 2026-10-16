// The LibSQL storage and vector store behind the memory, opened once on first use.

import { LibSQLStore, LibSQLVector } from "@mastra/libsql";

import { memoryDbUrl } from "../../lib/config";

let store: LibSQLStore | null = null;
let vector: LibSQLVector | null = null;

export function memoryStore(): LibSQLStore {
	store ??= new LibSQLStore({ id: "character-agent", url: memoryDbUrl() });
	return store;
}

let ready: Promise<void> | null = null;

/** The storage's memory domain, its tables created on first use. */
export async function memoryTables() {
	ready ??= memoryStore().init();
	await ready;
	return memoryStore().getStore("memory");
}

export function memoryVector(): LibSQLVector {
	vector ??= new LibSQLVector({ id: "character-agent-vectors", url: memoryDbUrl() });
	return vector;
}

/** Mastra's deleteThread leaves the thread's observation log behind. */
export async function clearObservations(threadId: string, resourceId: string): Promise<void> {
	const stored = await memoryTables();
	await stored?.clearObservationalMemory(threadId, resourceId);
}
