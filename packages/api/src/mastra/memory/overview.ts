// What the memory screen shows of a character's memory, and forgetting it.

import type { Memory } from "@mastra/memory";
import type { MemoryOverview } from "@nextroom/contracts";

import { characterResource, forgetThread } from "./thread";

export const WORKING_MEMORY_TEMPLATE = `# 二人の関係
- 今の関係:
- 距離感:
- 私の呼び方:
- ユーザーからの呼ばれ方:

# ユーザーへの気持ち
-

# 大事な出来事
-

# 約束
-

# 二人だけの話題
-

# 気にかけていること
-

# ユーザーについて
- 好き:
- 苦手:
- 大切にしていること:
`;

/** What a character remembers, for the memory screen. */
export async function memoryOverview(memory: Memory, characterId: string): Promise<MemoryOverview> {
	const resourceId = characterResource(characterId);
	const working = await memory.getWorkingMemory({ threadId: characterId, resourceId });
	return {
		resource_id: resourceId,
		working_memory: working ?? "",
	};
}

/** Forget everything the character holds: its thread with the messages, observations and
 *  working memory on it. */
export const clearMemory = (memory: Memory, characterId: string) =>
	forgetThread(memory, characterId);
