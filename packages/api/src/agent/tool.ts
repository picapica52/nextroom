// The character's tools, as this app writes them: a zod schema (or a JSON Schema, for tools
// that come with one, such as Composio's) and a function of the input and the call. toAgentTool
// turns one into pi's AgentTool for a reply.

import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { TSchema } from "@earendil-works/pi-ai";
import { z } from "zod";
import { mayRun } from "./approvals";
import type { CharacterContext } from "./context";

/** One call of a tool, in a reply. */
export interface ToolCall {
	id: string;
	signal: AbortSignal;
	context: CharacterContext;
	/** Output that streams in while the tool runs, such as a command's stdout. */
	output: (text: string) => void;
}

interface ToolBase {
	name: string;
	description: string;
	/** Runs one at a time with the other calls of the same step. */
	sequential?: boolean;
	/** The call changes something (acts on a page, writes, deletes, runs, sends): it is checked
	 *  before it runs in the Auto and Ask approval modes (approvals.ts). */
	changes?: boolean | ((input: unknown) => boolean);
	/** What the approval rules know the call by; the tool's name unless it says otherwise. */
	approvalKey?: (input: unknown) => string;
}

export interface ZodTool<S extends z.ZodType> extends ToolBase {
	schema: S;
	execute: (input: z.infer<S>, call: ToolCall) => Promise<unknown>;
}

export interface JsonSchemaTool extends ToolBase {
	jsonSchema: Record<string, unknown>;
	execute: (input: unknown, call: ToolCall) => Promise<unknown>;
}

export type CharacterTool = ZodTool<z.ZodType> | JsonSchemaTool;

/** A tool with a zod schema; its input is checked against the schema before it runs. */
export const defineTool = <S extends z.ZodType>(tool: ZodTool<S>): CharacterTool =>
	tool as unknown as CharacterTool;

/** The tools a reply has, by name. */
export type ToolSet = Record<string, CharacterTool>;

/** A result the model also sees as images (a screenshot). Only the text is kept for the screen. */
export class ImageResult {
	constructor(
		readonly text: string,
		readonly images: { data: string; mimeType: string }[],
	) {}
}

const textOf = (result: unknown) =>
	typeof result === "string" ? result : (JSON.stringify(result) ?? "");

function parametersOf(tool: CharacterTool): TSchema {
	if ("jsonSchema" in tool) return tool.jsonSchema as unknown as TSchema;
	const { $schema: _, ...schema } = z.toJSONSchema(tool.schema, { io: "input" });
	return schema as unknown as TSchema;
}

/** The tool for one reply: `context` is what every call of it is told. */
export function toAgentTool(tool: CharacterTool, context: CharacterContext): AgentTool {
	return {
		name: tool.name,
		label: tool.name,
		description: tool.description,
		parameters: parametersOf(tool),
		...(tool.sequential ? { executionMode: "sequential" as const } : {}),
		async execute(id, params, signal, onUpdate): Promise<AgentToolResult<unknown>> {
			let streamed = "";
			const call: ToolCall = {
				id,
				signal: signal ?? context.reporter.signal,
				context,
				output: (text) => {
					streamed += text;
					context.reporter.append(id, text);
					onUpdate?.({ content: [{ type: "text", text: streamed }], details: undefined });
				},
			};
			const input = "jsonSchema" in tool ? params : tool.schema.parse(params);
			const allowed = await mayRun(tool, input, call);
			const result = allowed === true ? await tool.execute(input as never, call) : allowed;
			if (result instanceof ImageResult)
				return {
					content: [
						{ type: "text", text: result.text },
						...result.images.map((image) => ({ type: "image" as const, ...image })),
					],
					details: result.text,
				};
			return { content: [{ type: "text", text: textOf(result) }], details: result };
		},
	};
}
