import type { Memory } from "@mastra/memory";
import { withoutFaceTags } from "../conversations/face-tags";

/** A message as Mastra's memory stores it. */
export type StoredDbMessage = Parameters<Memory["saveMessages"]>[0]["messages"][number];

/** The text parts of a stored message, in order, without the face tags of the replies. */
export const textParts = (content: StoredDbMessage["content"]): string[] =>
	(content.parts ?? []).flatMap((p) => (p.type === "text" ? [withoutFaceTags(p.text)] : []));

/** A message of the user or a reply (not a system or tool message). */
export const isChatTurn = <M extends { role: string }>(
	m: M,
): m is M & { role: "user" | "assistant" } => m.role === "user" || m.role === "assistant";
