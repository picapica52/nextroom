// The character in a voice channel. What each person says is cut at their pauses, transcribed,
// and sent to the character's conversation as a turn, the same as speaking in the app; the
// reply's sentences are played in the channel as soon as each is synthesized. With more than one
// person in the channel, each line is prefixed with who said it. From when a line is heard until
// its reply has been played, what anyone says is not heard.

import { Readable } from "node:stream";

import {
	type AudioPlayer,
	AudioPlayerStatus,
	createAudioPlayer,
	createAudioResource,
	EndBehaviorType,
	entersState,
	joinVoiceChannel,
	NoSubscriberBehavior,
	StreamType,
	type VoiceConnection,
	VoiceConnectionStatus,
} from "@discordjs/voice";
import type { Guild, VoiceBasedChannel } from "discord.js";
import prism from "prism-media";

import { onSegment } from "../conversations/live-turn";
import { submitOpening, submitTurn } from "../conversations/turn";
import { ConflictError, messageOf } from "../lib/errors";
import { queue } from "../lib/jobs";
import { irodoriVoice } from "../mastra";
import { pcmSeconds, playablePcm, utteranceWav } from "./audio";
import { loadDiscordSettings } from "./settings";

/** Shorter sounds (a cough, a click) are not sent to the recognizer. */
const MIN_UTTERANCE_S = 0.4;
const MAX_UTTERANCE_S = 30;
/** Noise is often heard as a word or two; shorter lines are not answered. */
const MIN_UTTERANCE_CHARS = 5;

/** Characters, leaving out punctuation, symbols and spaces. */
const charCount = (text: string) => [...text.replace(/[\p{P}\p{S}\s]/gu, "")].length;
const RETRY_MS = 1500;

interface Turn {
	characterId: string;
	jobId: string;
	replyId: string;
}

export class VoiceSession {
	readonly guild: Guild;
	readonly channelName: string;
	private readonly connection: VoiceConnection;
	private readonly player: AudioPlayer;
	private readonly listening = new Set<string>();
	private readonly clips: Buffer[] = [];
	private pending: string[] = [];
	private processing = false;
	private current: Turn | null = null;
	private retry: ReturnType<typeof setTimeout> | undefined;
	private closed = false;

	constructor(
		private readonly channel: VoiceBasedChannel,
		private readonly onClose: () => void,
	) {
		this.guild = channel.guild;
		this.channelName = channel.name;
		this.connection = joinVoiceChannel({
			channelId: channel.id,
			guildId: channel.guild.id,
			adapterCreator: channel.guild.voiceAdapterCreator,
			selfDeaf: false,
		});
		this.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
		this.player.on(AudioPlayerStatus.Idle, () => this.playNext());
		this.player.on("error", (error) => console.warn("Discord: could not play:", error.message));
		this.connection.subscribe(this.player);
		this.connection.receiver.speaking.on("start", (userId) => this.listen(userId));
		this.connection.on(VoiceConnectionStatus.Disconnected, () => void this.reconnect());
	}

	get channelId(): string {
		return this.channel.id;
	}

	/** Waits until the bot is in the channel; closes the session if it cannot get in. */
	async ready(): Promise<void> {
		try {
			await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
		} catch (error) {
			this.close();
			throw error;
		}
		if (loadDiscordSettings().greet) void this.greet();
	}

	/** The people (not bots) in the channel. */
	humans() {
		return this.channel.members.filter((m) => !m.user.bot);
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		clearTimeout(this.retry);
		this.stopSpeaking();
		this.player.stop(true);
		if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) this.connection.destroy();
		this.onClose();
	}

	/** A dropped connection that does not start reconnecting by itself (moved, kicked) ends it. */
	private async reconnect() {
		try {
			await Promise.race([
				entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
				entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
			]);
		} catch {
			this.close();
		}
	}

	private listen(userId: string) {
		if (this.closed || this.busy || this.listening.has(userId)) return;
		if (this.guild.members.cache.get(userId)?.user.bot) return;
		this.listening.add(userId);
		const silence = loadDiscordSettings().silence_ms;
		const opus = this.connection.receiver.subscribe(userId, {
			end: { behavior: EndBehaviorType.AfterSilence, duration: silence },
		});
		const decoder = new prism.opus.Decoder({ rate: 48_000, channels: 2, frameSize: 960 });
		const chunks: Buffer[] = [];
		let bytes = 0;
		decoder.on("data", (chunk: Buffer) => {
			if (pcmSeconds(bytes) >= MAX_UTTERANCE_S) return;
			chunks.push(chunk);
			bytes += chunk.length;
		});
		const done = () => {
			if (!this.listening.delete(userId)) return;
			// Someone else's line is already being answered.
			if (!this.busy && pcmSeconds(bytes) >= MIN_UTTERANCE_S)
				void this.heard(userId, utteranceWav(Buffer.concat(chunks)));
		};
		decoder.on("end", done);
		decoder.on("error", (error) => {
			console.warn("Discord: could not decode:", error.message);
			done();
		});
		opus.on("error", done);
		opus.pipe(decoder);
	}

	/** Nothing else is heard until this line is answered, or found not to need an answer. */
	private async heard(userId: string, wav: Uint8Array) {
		this.processing = true;
		try {
			await this.answer(userId, wav);
		} finally {
			this.processing = false;
		}
	}

	private async answer(userId: string, wav: Uint8Array) {
		let text: string;
		try {
			text = (await irodoriVoice.listen(wav)).trim();
		} catch (error) {
			console.warn("Discord: could not transcribe:", messageOf(error));
			return;
		}
		if (charCount(text) < MIN_UTTERANCE_CHARS || this.closed) return;
		const humans = this.humans();
		const name = humans.get(userId)?.displayName;
		const line = humans.size > 1 && name ? `${name}: ${text}` : text;
		this.pending.push(line);
		await this.sendPending();
	}

	/** A line is being heard or answered, or a reply is being made or played. */
	private get busy(): boolean {
		return (
			this.processing ||
			this.pending.length > 0 ||
			!!this.current ||
			this.player.state.status !== AudioPlayerStatus.Idle
		);
	}

	private stopSpeaking() {
		this.clips.length = 0;
		this.player.stop(true);
		if (this.current) queue.cancel(this.current.jobId);
		this.current = null;
	}

	/** Sends the line heard, as a turn; tried again while the app is replying in the conversation. */
	private async sendPending() {
		clearTimeout(this.retry);
		if (this.closed || this.current || !this.pending.length) return;
		const characterId = loadDiscordSettings().character_id;
		if (!characterId) return;
		const text = this.pending.join("\n");
		this.pending = [];
		try {
			await this.follow(characterId, await submitTurn(characterId, text, null, true, [], true));
		} catch (error) {
			// The app is in the middle of a reply in the same conversation: try again shortly.
			if (error instanceof ConflictError) {
				this.pending.unshift(text);
				this.retry = setTimeout(() => void this.sendPending(), RETRY_MS);
			} else console.warn("Discord: could not send the turn:", messageOf(error));
		}
	}

	private async greet() {
		const characterId = loadDiscordSettings().character_id;
		if (!characterId || this.busy) return;
		try {
			const turn = await submitOpening(characterId, true, true);
			if (turn) await this.follow(characterId, turn);
		} catch (error) {
			console.warn("Discord: could not greet:", messageOf(error));
		}
	}

	/** Plays the turn's sentences as they are synthesized, until its job ends. */
	private async follow(
		characterId: string,
		turn: { assistant: { id: string }; job: { id: string } },
	) {
		const mine: Turn = { characterId, jobId: turn.job.id, replyId: turn.assistant.id };
		this.current = mine;
		const stop = onSegment(characterId, (replyId, _segment, wav) => {
			if (this.current === mine && replyId === mine.replyId) this.play(wav);
		});
		try {
			await queue.get(mine.jobId)?.finished;
		} finally {
			stop();
			if (this.current === mine) this.current = null;
		}
		void this.sendPending();
	}

	private play(wav: Uint8Array) {
		try {
			this.clips.push(playablePcm(wav));
		} catch (error) {
			console.warn("Discord: could not read the speech:", messageOf(error));
			return;
		}
		if (this.player.state.status === AudioPlayerStatus.Idle) this.playNext();
	}

	/** The next sentence; once all are played, what was said meanwhile. */
	private playNext() {
		if (this.closed) return;
		const clip = this.clips.shift();
		if (!clip) return void this.sendPending();
		const stream = Readable.from([clip], { objectMode: false });
		this.player.play(createAudioResource(stream, { inputType: StreamType.Raw }));
	}
}
