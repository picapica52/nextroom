// What the agent does during a reply, kept on the assistant message as `steps` so the
// conversation screen can show each tool call as it runs, and ask before the ones that
// need the user's go-ahead.
//
// Asking works the same for every tool: the browser and sandbox tools, and Claude Agent
// SDK's own tools (through its canUseTool callback), wait on `TurnReporter.approve()`
// until the user answers on the screen. The reply's stream simply stays open meanwhile,
// so nothing has to be suspended and resumed.

import type { AgentStep, ChatMessage, StepKind } from "@nextroom/contracts";

import { newId, now } from "../lib/storage";

const MAX_INPUT = 300;
const MAX_OUTPUT = 10000;
const MAX_DETAIL = 10000;
const FLUSH_MS = 250;

function stepKind(tool: string): StepKind {
	if (tool.startsWith("stagehand_") || tool === "web_search" || tool === "find_topic")
		return "browser";
	if (tool.startsWith("mastra_workspace_")) return "sandbox";
	if (tool === "send_photo") return "image";
	if (tool.startsWith("claude") || tool === "delegate_to_claude") return "claude";
	if (tool === "ask_user") return "ask";
	if (/^[A-Z0-9]+_[A-Z0-9_]+$/.test(tool)) return "app";
	return "other";
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);
const tail = (text: string, max: number) => (text.length > max ? `…${text.slice(-max)}` : text);

const MAIN_FIELDS = [
	"question",
	"query",
	"command",
	"instruction",
	"url",
	"task",
	"path",
	"file_path",
	"pattern",
	"title",
	"description",
	"memory",
	"scene",
];

/** The part of a tool's input worth showing: its command, instruction, URL or path. */
function summarizeInput(input: unknown): string {
	if (input == null) return "";
	if (typeof input === "string") return clip(input, MAX_INPUT);
	if (typeof input === "object") {
		const record = input as Record<string, unknown>;
		const main = MAIN_FIELDS.map((key) => record[key]).find((v) => typeof v === "string" && v);
		if (main) {
			const args = Array.isArray(record.args) ? ` ${record.args.join(" ")}` : "";
			return clip(`${main}${args}`, MAX_INPUT);
		}
		if (Array.isArray(record.todos)) return todoSummary(record.todos);
	}
	return clip(JSON.stringify(input), MAX_INPUT);
}

/** TodoWrite's list as "2/3: <the one in progress>". */
function todoSummary(todos: unknown[]): string {
	const items = todos.filter((t): t is { content?: string; status?: string } => !!t);
	const done = items.filter((t) => t.status === "completed").length;
	const current = items.find((t) => t.status === "in_progress")?.content ?? "";
	return clip(`TODO ${done}/${items.length}${current ? `: ${current}` : ""}`, MAX_INPUT);
}

/** The whole input, for the step's details. */
function describeInput(input: unknown): string {
	if (input == null) return "";
	if (typeof input === "string") return clip(input, MAX_DETAIL);
	return clip(JSON.stringify(input, null, 2) ?? "", MAX_DETAIL);
}

function summarizeOutput(output: unknown): string {
	if (output == null) return "";
	if (typeof output === "string") return tail(output, MAX_OUTPUT);
	if (typeof output === "object") {
		const record = output as Record<string, unknown>;
		for (const key of ["message", "error", "text", "stdout", "content"]) {
			if (typeof record[key] === "string" && record[key]) return tail(record[key], MAX_OUTPUT);
		}
		if ("data" in record) return clip(JSON.stringify(record.data), MAX_OUTPUT);
	}
	return clip(JSON.stringify(output), MAX_OUTPUT);
}

interface Decision {
	approved: boolean;
	/** Allow this tool for the rest of the conversation. */
	always: boolean;
}

interface Pending {
	sessionId: string;
	resolve: (decision: Decision) => void;
}

const pending = new Map<string, Pending>();
/** Tools the user allowed for the rest of a conversation, by session. */
const allowed = new Map<string, Set<string>>();

/** The user's answer to a question asked by `TurnReporter.approve()`; false if it is gone. */
export function decide(sessionId: string, approvalId: string, decision: Decision): boolean {
	const waiting = pending.get(approvalId);
	if (!waiting || waiting.sessionId !== sessionId) return false;
	pending.delete(approvalId);
	waiting.resolve(decision);
	return true;
}

export const forgetSession = (sessionId: string) => allowed.delete(sessionId);

/** Where the steps go as they change, with the reply's status while a question is open. */
export type StepsListener = (steps: AgentStep[], status?: ChatMessage["status"]) => void;

/** Collects one reply's steps and hands them to `onChange`. */
export class TurnReporter {
	readonly steps: AgentStep[] = [];
	private timer: ReturnType<typeof setTimeout> | null = null;
	private wasAwaiting = false;
	/** The reply has offered its choices, so it is over. */
	offered = false;

	constructor(
		readonly sessionId: string,
		/** Aborted when the turn is cancelled; a question still open is then declined. */
		readonly signal: AbortSignal,
		private readonly onChange: StepsListener,
	) {}

	private find(id: string): AgentStep | undefined {
		return this.steps.find((s) => s.id === id);
	}

	start(id: string, tool: string, input: unknown, parent?: string): void {
		const existing = this.find(id);
		if (existing) {
			existing.input = summarizeInput(input) || existing.input;
			existing.detail = describeInput(input) || existing.detail;
		} else {
			this.steps.push({
				id,
				tool,
				kind: parent ? "claude" : stepKind(tool),
				status: "running",
				input: summarizeInput(input),
				detail: describeInput(input),
				output: "",
				...(parent ? { parent } : {}),
				started_at: now(),
			});
		}
		this.flush(true);
	}

	/** Output that streams in, such as a command's stdout. */
	append(id: string, text: string): void {
		const step = this.find(id);
		if (!step || !text) return;
		step.output = tail(step.output + text, MAX_OUTPUT);
		this.flush();
	}

	finish(id: string, status: "done" | "error", output?: unknown): void {
		const step = this.find(id);
		if (!step) return;
		if (step.status !== "declined") step.status = status;
		const summary = summarizeOutput(output);
		// Streamed output is the better record of a command; keep it.
		if (summary && !step.output) step.output = summary;
		step.finished_at = now();
		this.flush(true);
	}

	/** Ask the user whether the call may run; true once they allow it. */
	async approve(id: string, tool: string, input: unknown, parent?: string): Promise<boolean> {
		if (allowed.get(this.sessionId)?.has(tool)) return true;
		this.start(id, tool, input, parent);
		const step = this.find(id);
		if (!step) return false;
		if (this.signal.aborted) return false;
		const approvalId = newId("ap_");
		step.status = "awaiting";
		step.approval = approvalId;
		this.flush(true);
		const decision = await new Promise<Decision>((resolve) => {
			pending.set(approvalId, { sessionId: this.sessionId, resolve });
			this.signal.addEventListener(
				"abort",
				() => decide(this.sessionId, approvalId, { approved: false, always: false }),
				{ once: true },
			);
		});
		delete step.approval;
		if (decision.approved && decision.always) {
			const tools = allowed.get(this.sessionId) ?? new Set<string>();
			tools.add(tool);
			allowed.set(this.sessionId, tools);
		}
		step.status = decision.approved ? "running" : "declined";
		if (!decision.approved) step.finished_at = now();
		this.flush(true);
		return decision.approved;
	}

	/** The character's choices for what the user says next (ask_user); the reply ends with them. */
	offer(id: string, input: unknown, question: NonNullable<AgentStep["question"]>): void {
		this.start(id, "ask_user", input);
		const step = this.find(id);
		if (!step) return;
		step.question = question;
		this.offered = true;
		this.flush(true);
	}

	get awaiting(): boolean {
		return this.steps.some((s) => s.status === "awaiting");
	}

	/** Write the steps now, or soon when output is streaming in. */
	flush(now = false): void {
		if (now) {
			if (this.timer) clearTimeout(this.timer);
			this.timer = null;
			this.write();
			return;
		}
		this.timer ??= setTimeout(() => {
			this.timer = null;
			this.write();
		}, FLUSH_MS);
	}

	private write(): void {
		const awaiting = this.awaiting;
		// The reply goes back to "thinking" once the question is answered.
		const status = awaiting ? "awaiting" : this.wasAwaiting ? "thinking" : undefined;
		this.wasAwaiting = awaiting;
		this.onChange(
			this.steps.map((s) => ({ ...s })),
			status,
		);
	}

	/** At the end of the reply: steps still open were cut off, so they end as errors. */
	close(): void {
		for (const step of this.steps) {
			if (step.status === "running" || step.status === "awaiting") {
				step.status = "error";
				step.finished_at = now();
			}
		}
		this.flush(true);
	}
}
