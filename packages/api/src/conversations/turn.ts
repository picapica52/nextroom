// One exchange: speech in → speech.cpp → the character agent (pi) → Irodori-TTS speech out.
// Listening and speaking go through the agent's voice (irodoriVoice). The turn's messages are
// kept in the character's conversation log, which is where the conversation is read back from,
// and the agent may use tools on the way; each tool call is recorded on the reply as a step.
// While the turn runs, its messages are kept in memory (live-turn).
//
// Each user turn runs as one job on this app's queue, with the settings and the character as
// they were when it was submitted (TurnPlan). Transcription and synthesis are done
// by speech.cpp on the engine's GPU queue, which runs one job at a time. The reply is
// streamed from the LLM and cut into lines; every line is synthesized as soon as it
// is complete and held in memory (live-turn) so the browser can start playing before the
// reply ends; the audio is not saved with the conversation. Only the call screen asks for
// speech; in the chat, or with speech turned off in the settings, the sentences only update
// the reply's text. In a call, the Decisions API chooses the face the call screen shows with
// each sentence (expression.ts).

import type { Message } from "@earendil-works/pi-ai";
import {
	AFFINITY_EVENT_LABELS,
	type AgentSettings,
	type AgentStep,
	type CharacterView,
	type ChatMessage,
	type ChatSessionRecord,
	type ChatSettings,
	type Routine,
} from "@nextroom/contracts";
import type { EventChoice } from "../affinity/events";
import {
	type AffinityTurn,
	finishAffinityTurn,
	OPENING_TRIGGER,
	openingEvent,
	prepareAffinityTurn,
} from "../affinity/turn";
import { streamReply, TEXT_BREAK } from "../agent";
import type { CharacterContext } from "../agent/context";
import { compactSoon } from "../agent/memory";
import { emptyReplyError } from "../agent/models";
import { type LlmConnection, replyConnections } from "../agent/providers";
import type { RunStarter } from "../agent/routines";
import { TurnReporter } from "../agent/steps";
import { BRIEF_NOTE } from "../characters/instructions";
import { conversationPrompt } from "../characters/prompt";
import { getCharacter } from "../characters/store";
import { canDecide } from "../decisions/client";
import type { VoiceSettings } from "../engine/voice";
import { BadRequestError, Cancelled, ConflictError, messageOf } from "../lib/errors";
import { type Job, queue } from "../lib/jobs";
import { newId, now } from "../lib/storage";
import { ThinkFilter } from "../lib/text";
import { loadAgentSettings } from "../settings/agent";
import { loadSettings, speaksWith } from "../settings/chat";
import { faceChooser, faceTagsOf } from "./expression";
import { lastTalkedAt, recordBrokenTurn, recordTurn } from "./history";
import { MAX_TURN_IMAGES, saveChatImage, withImageNote } from "./images";
import {
	liveMessage,
	removeMessage,
	settleSpeech,
	settleTurn,
	startTurn,
	turnRunning,
	updateMessage,
} from "./live-turn";
import { loadSession, saveSession } from "./sessions";
import { createSpeaker } from "./speaker";
import { SpokenSentences } from "./speech";
import { transcribeTurn } from "./transcribe";

/** Everything a turn runs with, as it was when the turn was submitted. */
interface TurnPlan {
	sessionId: string;
	userId: string;
	replyId: string;
	/** Kept in memory only until it is transcribed; null for a typed turn. */
	recording: Uint8Array | null;
	/** The images the user attached (ids in the conversation's folder). */
	images: string[];
	session: ChatSessionRecord;
	character: CharacterView;
	settings: ChatSettings;
	agentSettings: AgentSettings;
	/** The call screen asked for speech and the settings have it on. */
	speaks: boolean;
	voice: VoiceSettings;
	/** The character opens the conversation with this event (the user said nothing). */
	opening: EventChoice | null;
	/** Told to answer in a word or a short sentence (in a Discord voice channel). */
	brief: boolean;
	/** The routine this turn runs, with no one at the device. */
	routine: Routine | null;
}

/** Queue one exchange: the user's text or recording (WAV), and any images, in; a reply out
 *  (spoken with `speak`, kept short with `brief`). */
export async function submitTurn(
	sessionId: string,
	text: string,
	audio: Uint8Array | null,
	speak: boolean,
	images: Uint8Array[] = [],
	brief = false,
) {
	const typed = text.trim();
	if (!typed && !audio?.length && !images.length)
		throw new BadRequestError("音声かテキストか画像を送ってください");
	if (images.length > MAX_TURN_IMAGES)
		throw new BadRequestError(`画像は一度に ${MAX_TURN_IMAGES} 枚までです`);
	const session = loadSession(sessionId);
	const character = getCharacter(sessionId);
	// A turn being cancelled (the user talked over it) no longer blocks the next one.
	if (turnRunning(sessionId)) throw new ConflictError("前の返答を処理中です");
	const recording = typed || !audio?.length ? null : audio;
	const imageIds: string[] = [];
	for (const image of images) imageIds.push(await saveChatImage(sessionId, image, "user"));
	const user: ChatMessage = {
		id: newId("m_"),
		role: "user",
		text: typed,
		status: recording ? "queued" : "done",
		...(imageIds.length ? { images: imageIds } : {}),
		created_at: now(),
	};
	if (recording) user.spoken = true;
	return queueTurn(session, character, user, recording, speak, null, brief);
}

/** The character speaks first as the conversation opens, when it has an event to start
 *  (null otherwise, or while a turn is under way). */
export async function submitOpening(sessionId: string, speak: boolean, brief = false) {
	const session = loadSession(sessionId);
	const character = getCharacter(sessionId);
	if (turnRunning(sessionId)) return null;
	const event = await openingEvent(character);
	if (!event || turnRunning(sessionId)) return null;
	const user: ChatMessage = {
		id: newId("m_"),
		role: "user",
		text: OPENING_TRIGGER,
		status: "done",
		hidden: true,
		created_at: now(),
	};
	return queueTurn(session, character, user, null, speak, event, brief);
}

/** What the character is told when a routine's time comes. */
const routinePrompt = (routine: Routine) =>
	[
		`[Routine: ${routine.name}]`,
		`It is time for this, which the user set up: ${routine.instruction}`,
		"The user is not at the device now. Do it now, with your tools if it needs them, and leave what you would say to them; they will read it later.",
	].join("\n");

/** Runs a routine as a turn of its character's conversation, nothing spoken; null while the
 *  character is busy with another turn. */
export function submitRoutine(routine: Routine) {
	const sessionId = routine.character_id;
	if (turnRunning(sessionId)) return null;
	const session = loadSession(sessionId);
	const character = getCharacter(sessionId);
	const user: ChatMessage = {
		id: newId("m_"),
		role: "user",
		text: routinePrompt(routine),
		status: "done",
		hidden: true,
		created_at: now(),
	};
	return queueTurn(session, character, user, null, false, null, false, routine);
}

/** A routine's run, for the scheduler (agent/routines): how it ended and what was said. */
export const runRoutineTurn: RunStarter = (routine) => {
	const turn = submitRoutine(routine);
	if (!turn) return null;
	const { assistant } = turn;
	return {
		finished: turn.finished.then(() => ({
			status:
				assistant.status === "done"
					? "done"
					: assistant.status === "cancelled"
						? "cancelled"
						: "error",
			reply: assistant.text,
			error: assistant.error ?? null,
		})),
	};
};

function queueTurn(
	session: ChatSessionRecord,
	character: CharacterView,
	user: ChatMessage,
	recording: Uint8Array | null,
	speak: boolean,
	opening: EventChoice | null,
	brief: boolean,
	routine: Routine | null = null,
) {
	const sessionId = session.id;
	const reply: ChatMessage = {
		id: newId("m_"),
		role: "assistant",
		text: "",
		status: "queued",
		error: null,
		created_at: user.created_at,
	};
	const settings = loadSettings();
	const plan: TurnPlan = {
		sessionId,
		userId: user.id,
		replyId: reply.id,
		recording,
		images: user.images ?? [],
		session,
		character,
		settings,
		agentSettings: loadAgentSettings(),
		speaks: speak && speaksWith(character.voice, settings),
		voice: character.voice,
		opening,
		brief,
		routine,
	};
	const title = routine
		? `ルーティン: ${routine.name}`
		: opening
			? AFFINITY_EVENT_LABELS[opening.kind]
			: user.text || (recording ? "音声入力" : "画像");
	const job = queue.submit("chat", `会話: ${title.slice(0, 20)}`, (job) => runTurn(job, plan), {
		session_id: sessionId,
	});
	user.job_id = reply.job_id = job.id;
	startTurn(sessionId, user, reply);
	saveSession(session);
	return { user, assistant: reply, job: job.view(), finished: job.finished };
}

async function runTurn(job: Job, plan: TurnPlan) {
	const { sessionId, replyId } = plan;
	const connections = replyConnections(
		plan.settings,
		plan.routine?.model ?? plan.character.agent.model,
	);
	const userText = await heardText(job, plan);
	if (userText === null) return { text: "" };
	job.checkCancelled();
	const turn = await prepareTurn(job, plan, connections, userText);

	updateMessage(sessionId, replyId, { status: "thinking" });
	job.update(0.2, "返答を生成中");

	const stop = new AbortController();
	const onCancel = () => stop.abort();
	job.signal.addEventListener("abort", onCancel);
	const reply = replyWriter(job, plan, turn.chooseFace, stop);
	const kept: Message[] = [];
	try {
		await streamTurn(plan, turn, userText, reply, stop.signal, kept);
		return await finishTurn(job, plan, turn, reply, kept);
	} catch (error) {
		const speakError = await reply.speaker.drain();
		const reason = job.cancelled ? new Cancelled() : (speakError ?? error);
		const text = reply.text.trim();
		updateMessage(
			sessionId,
			replyId,
			reason instanceof Cancelled
				? { status: "cancelled", text }
				: { status: "error", error: messageOf(reason), text },
		);
		keepBrokenTurn(plan, withImageNote(userText, plan.images));
		throw reason;
	} finally {
		job.signal.removeEventListener("abort", onCancel);
		stop.abort();
	}
}

/** What the user said: typed, or transcribed from the recording. Null when the turn is gone or
 *  nothing intelligible was said; the reply is then dropped instead of asking the LLM. */
async function heardText(job: Job, plan: TurnPlan): Promise<string | null> {
	const { sessionId, userId, replyId, recording } = plan;
	const user = liveMessage(sessionId, userId);
	if (!user) return null;
	if (user.status === "done" || !recording) return user.text;
	const text = await transcribeTurn(
		job,
		sessionId,
		{ user: userId, reply: replyId },
		recording,
		plan.settings,
	);
	if (!text) {
		updateMessage(sessionId, userId, { status: "empty" });
		removeMessage(sessionId, replyId);
		return null;
	}
	updateMessage(sessionId, userId, { status: "done", text });
	return text;
}

interface PreparedTurn {
	context: CharacterContext;
	affinity: AffinityTurn;
	/** null: the faces do not change. */
	chooseFace: ReturnType<typeof faceChooser> | null;
}

/** The agent's context for the reply. */
async function prepareTurn(
	job: Job,
	plan: TurnPlan,
	connections: LlmConnection[],
	userText: string,
): Promise<PreparedTurn> {
	const { sessionId, replyId, character, agentSettings } = plan;
	const lastTalk = lastTalkedAt(sessionId);
	const prompt = conversationPrompt(character, plan.settings, lastTalk);
	const affinity = await prepareAffinityTurn({
		character,
		userText,
		opening: plan.opening,
		quiet: !!plan.routine,
		spoken: !!plan.recording,
		connection: connections,
		signal: job.signal,
	});
	prompt.postHistory = [prompt.postHistory, affinity.note, plan.brief ? BRIEF_NOTE : ""]
		.filter(Boolean)
		.join("\n\n");
	const faceTags =
		plan.speaks && plan.settings.face_changes_enabled && canDecide()
			? affinity.faces(faceTagsOf(character.expressions))
			: [];
	const chooseFace = faceTags.length
		? faceChooser({
				expressions: character.expressions,
				tags: faceTags,
				charName: character.persona.name,
				userText: plan.opening ? "" : userText,
				signal: job.signal,
			})
		: null;
	const reporter = new TurnReporter(
		sessionId,
		job.signal,
		(steps, status) => updateMessage(sessionId, replyId, { steps, ...(status ? { status } : {}) }),
		!!plan.routine,
	);
	return {
		context: {
			...prompt,
			connections,
			connection: connections[0] as LlmConnection,
			request: plan.routine?.instruction ?? userText,
			sessionId,
			characterId: sessionId,
			settings: agentSettings,
			disabledTools: character.agent.disabled_tools,
			reporter,
			addImages: (ids) =>
				updateMessage(sessionId, replyId, {
					images: [...(liveMessage(sessionId, replyId)?.images ?? []), ...ids],
				}),
		},
		affinity,
		chooseFace,
	};
}

/** The reply as it streams in: its text without thinking, and its sentences queued to be
 *  spoken. */
function replyWriter(
	job: Job,
	plan: TurnPlan,
	chooseFace: PreparedTurn["chooseFace"],
	stop: AbortController,
) {
	const think = new ThinkFilter();
	// Narration (`*…*`), in older replies or written against the instructions, is shown in the
	// reply but not read aloud.
	const sentences = new SpokenSentences();
	let full = "";
	const speaker = createSpeaker({
		job,
		sessionId: plan.sessionId,
		replyId: plan.replyId,
		ttsEnabled: plan.speaks,
		voice: plan.voice,
		characterId: plan.sessionId,
		chooseFace,
		text: () => full,
		stop,
	});
	// No leading blank, so the places of the sentences hold once the reply is trimmed.
	const add = (text: string) => {
		full += full ? text : text.trimStart();
	};
	return {
		speaker,
		get text() {
			return full;
		},
		feed(piece: string) {
			add(think.feed(piece));
			speaker.queue(sentences.feed(full));
		},
		/** Where a run of text ends: what was held back is complete now. */
		flush() {
			add(think.flush());
			speaker.queue(sentences.flush(full));
		},
	};
}

type ReplyWriter = ReturnType<typeof replyWriter>;

async function streamTurn(
	plan: TurnPlan,
	turn: PreparedTurn,
	userText: string,
	reply: ReplyWriter,
	signal: AbortSignal,
	kept: Message[],
): Promise<void> {
	const s = plan.settings;
	const stream = streamReply(turn.context, withImageNote(userText, plan.images), {
		temperature: s.temperature,
		maxTokens: s.max_tokens ?? undefined,
		signal,
		kept,
	});
	for await (const piece of stream) {
		if (piece === TEXT_BREAK) reply.flush();
		else reply.feed(piece);
	}
	reply.flush();
}

/** How the reply's tool work went, leaving out its questions to the user. */
function toolsOutcome(steps: AgentStep[]): "none" | "ok" | "error" {
	const work = steps.filter((s) => s.kind !== "ask");
	if (!work.length) return "none";
	return work.some((s) => s.status === "error") ? "error" : "ok";
}

/** Once the reply is complete and spoken: it is done, and kept in the conversation log. */
async function finishTurn(
	job: Job,
	plan: TurnPlan,
	turn: PreparedTurn,
	reply: ReplyWriter,
	kept: Message[],
) {
	const { sessionId, userId, replyId } = plan;
	const speakError = await reply.speaker.drain();
	if (speakError) throw speakError;
	job.checkCancelled();
	const full = reply.text.trim();
	// A reply may be only its choices (ask_user), or only the images it drew.
	const drew = !!liveMessage(sessionId, replyId)?.images?.length;
	if (!full && !turn.context.reporter.offered && !drew) throw emptyReplyError();
	settleSpeech(sessionId, full.length);
	updateMessage(sessionId, replyId, { status: "done", text: full });
	try {
		const affinity = finishAffinityTurn({
			character: plan.character,
			opened: !!plan.opening || !!plan.routine,
			spoken: !!plan.recording,
			tools: toolsOutcome(liveMessage(sessionId, replyId)?.steps ?? []),
			event: turn.affinity.event,
			reply: full,
		});
		if (affinity.event || affinity.level_up) updateMessage(sessionId, replyId, { affinity });
	} catch (error) {
		console.warn(`Could not count the affinity of character ${plan.character.id}:`, error);
	}
	const user = liveMessage(sessionId, userId);
	const done = liveMessage(sessionId, replyId);
	if (user && done) recordTurn(sessionId, user, done, kept);
	settleTurn(sessionId);
	compactSoon(sessionId, {
		connections: turn.context.connections,
		charName: plan.character.persona.name,
		userName: plan.settings.user_name,
	});
	return { text: full, segments: reply.speaker.spokenCount };
}

/** A reply that failed or was cut off is kept as far as it got (not the opening's trigger). */
function keepBrokenTurn(plan: TurnPlan, userText: string) {
	const user = liveMessage(plan.sessionId, plan.userId);
	const reply = liveMessage(plan.sessionId, plan.replyId);
	if (!user || !reply || plan.opening) return;
	try {
		recordBrokenTurn(plan.sessionId, user, userText, reply);
	} catch (error) {
		console.warn(`Could not keep the broken turn of ${plan.sessionId}:`, error);
	}
}
