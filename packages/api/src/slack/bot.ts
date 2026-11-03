// The Slack bot, connected while the server runs and the settings have it on. It uses Socket
// Mode, so it needs no server of its own: it connects out to Slack. A direct message to the bot,
// or a mention of it in a channel, is sent to the character's conversation as a typed turn, and
// the reply is written back (in the thread, for a mention). Messages are answered one at a time,
// in the order they came, since the character has one conversation.

import type { SlackStatus } from "@nextroom/contracts";
import { SocketModeClient } from "@slack/socket-mode";
import { WebClient } from "@slack/web-api";

import { submitTurn } from "../conversations/turn";
import { ConflictError, messageOf } from "../lib/errors";
import { loadSlackSettings, slackTokens } from "./settings";

/** How long a message waits while the app is replying in the same conversation. */
const WAIT_MS = 120_000;
const RETRY_MS = 1500;
const THINKING = "eyes";

interface Incoming {
	user: string;
	text: string;
	channel: string;
	/** The thread to answer in; none for a direct message outside a thread. */
	thread: string | undefined;
	ts: string;
	direct: boolean;
}

interface Connection {
	socket: SocketModeClient;
	web: WebClient;
	botUserId: string;
	names: Map<string, string>;
	queue: Promise<void>;
}

let connection: Connection | null = null;
let status: SlackStatus = { state: "off", bot_name: null, team: null, error: null };

export const slackStatus = (): SlackStatus => ({ ...status });

/** Connects the bot when the settings have it on and both tokens; disconnects it first. */
export async function restartSlackBot(): Promise<void> {
	await stopSlackBot();
	const settings = loadSlackSettings();
	const tokens = slackTokens(settings);
	if (!settings.enabled || !tokens.bot || !tokens.app) return;
	status = { ...status, state: "connecting", error: null };
	const web = new WebClient(tokens.bot);
	const socket = new SocketModeClient({ appToken: tokens.app });
	const mine: Connection = {
		socket,
		web,
		botUserId: "",
		names: new Map(),
		queue: Promise.resolve(),
	};
	connection = mine;
	try {
		const auth = await web.auth.test();
		if (connection !== mine) return;
		mine.botUserId = auth.user_id ?? "";
		status = { ...status, bot_name: auth.user ?? null, team: auth.team ?? null };
		socket.on("connected", () => {
			if (connection === mine) status = { ...status, state: "ready", error: null };
		});
		socket.on("reconnecting", () => {
			if (connection === mine) status = { ...status, state: "connecting" };
		});
		socket.on("app_mention", ({ ack, event }) => {
			void ack();
			received(mine, event, false);
		});
		socket.on("message", ({ ack, event }) => {
			void ack();
			if (event.channel_type === "im") received(mine, event, true);
		});
		await socket.start();
	} catch (error) {
		if (connection === mine) {
			connection = null;
			status = { ...status, state: "error", error: messageOf(error) };
		}
		await socket.disconnect().catch(() => {});
	}
}

export async function stopSlackBot(): Promise<void> {
	const current = connection;
	connection = null;
	status = { state: "off", bot_name: null, team: null, error: null };
	await current?.socket.disconnect().catch(() => {});
}

// biome-ignore lint/suspicious/noExplicitAny: Slack's events come untyped from the socket.
function received(conn: Connection, event: any, direct: boolean) {
	// Edits, joins and the bot's own messages are not answered.
	if (event.subtype || event.bot_id || !event.user || event.user === conn.botUserId) return;
	const text = String(event.text ?? "")
		.replaceAll(`<@${conn.botUserId}>`, "")
		.trim();
	if (!text) return;
	const message: Incoming = {
		user: event.user,
		text,
		channel: event.channel,
		thread: direct ? event.thread_ts : (event.thread_ts ?? event.ts),
		ts: event.ts,
		direct,
	};
	conn.queue = conn.queue.then(() => answer(conn, message));
}

async function answer(conn: Connection, message: Incoming) {
	if (connection !== conn) return;
	const say = (text: string) =>
		conn.web.chat
			.postMessage({ channel: message.channel, thread_ts: message.thread, text })
			.catch((error) => console.warn("Slack: could not post:", messageOf(error)));
	const characterId = loadSlackSettings().character_id;
	if (!characterId) return void (await say("アプリの設定で、話すキャラクターを選んでください"));
	const reaction = { channel: message.channel, timestamp: message.ts, name: THINKING };
	await conn.web.reactions.add(reaction).catch(() => {});
	try {
		const line = message.direct
			? message.text
			: `${await nameOf(conn, message.user)}: ${message.text}`;
		const turn = await submitWhenFree(characterId, line);
		if (!turn) return void (await say("アプリで返答中のため、あとでもう一度話しかけてください"));
		await turn.finished.catch(() => {});
		const reply = turn.assistant;
		if (reply.status === "done" && reply.text.trim()) await say(reply.text.trim());
		else if (reply.status === "error")
			await say(`うまく返事ができませんでした: ${reply.error ?? "不明なエラー"}`);
	} catch (error) {
		await say(`うまくいきませんでした: ${messageOf(error)}`);
	} finally {
		await conn.web.reactions.remove(reaction).catch(() => {});
	}
}

/** Sends the turn, waiting while the app is replying in the same conversation; null if it never
 *  frees up. */
async function submitWhenFree(characterId: string, text: string) {
	const until = Date.now() + WAIT_MS;
	for (;;) {
		try {
			return await submitTurn(characterId, text, null, false);
		} catch (error) {
			if (!(error instanceof ConflictError)) throw error;
			if (Date.now() > until) return null;
			await Bun.sleep(RETRY_MS);
		}
	}
}

/** The person's name as Slack shows it, falling back to their id. */
async function nameOf(conn: Connection, userId: string): Promise<string> {
	const known = conn.names.get(userId);
	if (known) return known;
	try {
		const { user } = await conn.web.users.info({ user: userId });
		const name =
			user?.profile?.display_name || user?.profile?.real_name || user?.real_name || user?.name;
		if (name) {
			conn.names.set(userId, name);
			return name;
		}
	} catch (error) {
		console.warn("Slack: could not look up a name:", messageOf(error));
	}
	return userId;
}
