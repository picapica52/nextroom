// Conversations and their messages.

import { z } from "zod";

import { chatAffinityMarkSchema } from "./affinity";
import { agentStepSchema } from "./agent";
import type { JobView } from "./jobs";

const CHAT_STATUSES = [
	"queued",
	"transcribing",
	"thinking",
	/** A tool call waits for the user's go-ahead (see the message's steps). */
	"awaiting",
	"speaking",
	"done",
	"error",
	"cancelled",
	"empty",
] as const;
export type ChatStatus = (typeof CHAT_STATUSES)[number];

/** Statuses of a turn still in progress. */
export const ACTIVE_CHAT_STATUSES: readonly ChatStatus[] = [
	"queued",
	"transcribing",
	"thinking",
	"awaiting",
	"speaking",
];

export const chatSegmentSchema = z.object({
	text: z.string(),
	/** Where the sentence is in the reply's text. */
	start: z.number().int(),
	end: z.number().int(),
	audio: z.string(),
	duration: z.number(),
	/** The faces to show while it plays, one per phrase in order. `at`: where the phrase starts,
	 *  0–1 of the clip. `expression`: an expression id, or null for the character's avatar;
	 *  missing while it is being chosen, or when it is not chosen at all. */
	faces: z.array(z.object({ at: z.number(), expression: z.string().nullish() })).optional(),
});
export type ChatSegment = z.infer<typeof chatSegmentSchema>;

export const chatMessageSchema = z.object({
	id: z.string(),
	role: z.enum(["user", "assistant"]),
	text: z.string(),
	status: z.enum(CHAT_STATUSES),
	/** The user spoke this message (it was transcribed from the microphone). */
	spoken: z.boolean().optional(),
	/** Images in the conversation's folder: those the user attached, or those the reply drew. */
	images: z.array(z.string()).optional(),
	/** The agent's tool calls during the reply, in order. */
	steps: z.array(agentStepSchema).optional(),
	error: z.string().nullish(),
	job_id: z.string().optional(),
	/** Not shown: what starts a reply the character opens with (an event). */
	hidden: z.boolean().optional(),
	/** The reply was an event, or the affinity reached a new level with it. */
	affinity: chatAffinityMarkSchema.optional(),
	created_at: z.number(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

/** A character's one conversation as stored. Its id is the character's, which is also the id of
 *  the Mastra memory thread its messages live in. */
export const chatSessionRecordSchema = z.object({
	id: z.string(),
	created_at: z.number(),
	updated_at: z.number(),
});
export type ChatSessionRecord = z.infer<typeof chatSessionRecordSchema>;

export interface ChatSessionSummary {
	id: string;
	character_id: string;
	character_name: string;
	created_at: number;
	updated_at: number;
	message_count: number;
	/** The newest message the screen shows; null before the first talk. */
	last_message: { role: "user" | "assistant"; text: string; created_at: number } | null;
}

/** The latest reply's audio, one clip per sentence in speaking order. It is kept only in the
 *  server's memory for a while to be played on the spot, never saved with the conversation. */
export interface ChatSpeech {
	message_id: string;
	segments: ChatSegment[];
	/** How far into the reply its sentences are settled: synthesized, or found to hold nothing to
	 *  read. The whole reply once it is done. */
	until: number;
}

/** A conversation as the API answers it. */
export type ChatSession = ChatSessionRecord &
	ChatSessionSummary & { messages: ChatMessage[]; speech: ChatSpeech | null };

export interface ChatTurn {
	user: ChatMessage;
	assistant: ChatMessage;
	job: JobView;
}
