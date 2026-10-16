/**
 * The microphone and the WAV a recording is sent as: 16 kHz mono PCM, so the server never has to
 * decode a compressed browser format (MediaRecorder's WebM would need FFmpeg).
 */

/** The browser offers no microphone: it does so only on HTTPS and localhost. */
export class MicUnavailableError extends Error {
	constructor() {
		super("マイクは HTTPS か localhost で開いたときだけ使えます。");
		this.name = "MicUnavailableError";
	}
}

/** The microphone; rejects with MicUnavailableError where the browser offers none. */
function openMic(audio: MediaTrackConstraints | true = true): Promise<MediaStream> {
	if (!navigator.mediaDevices?.getUserMedia) return Promise.reject(new MicUnavailableError());
	return navigator.mediaDevices.getUserMedia({ audio });
}

const TARGET_RATE = 16000;

// Frames of about 20 ms, so the level meter is not updated hundreds of times a second.
const WORKLET = `
class Capture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(1024); this.n = 0 }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i]
        if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice()); this.n = 0 }
      }
    }
    return true
  }
}
registerProcessor('mic-capture', Capture)
`;

const MIC: MediaTrackConstraints = {
	channelCount: 1,
	echoCancellation: true,
	noiseSuppression: true,
	autoGainControl: true,
};

let prepared: Promise<AudioContext> | null = null;
let ready: AudioContext | null = null;

/** Creates the audio context and loads the capture worklet ahead of the first recording, so a
 *  press only has to open the microphone. Until a press resumes it, the context stays suspended. */
export function prepareRecorder(): Promise<AudioContext> {
	prepared ??= (async () => {
		const ctx = new AudioContext();
		const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
		try {
			await ctx.audioWorklet.addModule(url);
		} finally {
			URL.revokeObjectURL(url);
		}
		ready = ctx;
		return ctx;
	})().catch((e) => {
		prepared = null;
		throw e;
	});
	return prepared;
}

/** Records the microphone from start() to stop(), and hands it over as a 16 kHz WAV. */
export class MicRecorder {
	private ctx: AudioContext | null = null;
	private stream: MediaStream | null = null;
	private source: MediaStreamAudioSourceNode | null = null;
	private node: AudioWorkletNode | null = null;
	private chunks: Float32Array[] = [];
	private onLevel?: (level: number) => void;
	private closed = false;

	constructor(onLevel?: (level: number) => void) {
		this.onLevel = onLevel;
	}

	async start() {
		// Resumed while the press is still the current user gesture, which Safari requires.
		const resumed = ready?.resume();
		const [ctx, stream] = await Promise.all([prepareRecorder(), openMic(MIC)]);
		if (this.closed) {
			for (const t of stream.getTracks()) t.stop();
			return;
		}
		this.ctx = ctx;
		this.stream = stream;
		await (resumed ?? ctx.resume());
		// Closed while the context was resuming: close() has already released the stream.
		if (this.closed) return;
		this.node = new AudioWorkletNode(ctx, "mic-capture");
		this.node.port.onmessage = (e: MessageEvent<Float32Array>) => {
			const frame = e.data;
			this.chunks.push(frame);
			let sum = 0;
			for (const v of frame) sum += v * v;
			this.onLevel?.(Math.min(1, Math.sqrt(sum / frame.length) * 8));
		};
		this.source = ctx.createMediaStreamSource(stream);
		this.source.connect(this.node);
	}

	/** The seconds recorded so far. */
	get seconds() {
		const n = this.chunks.reduce((sum, c) => sum + c.length, 0);
		return this.ctx ? n / this.ctx.sampleRate : 0;
	}

	stop(): Blob {
		const rate = this.ctx?.sampleRate ?? TARGET_RATE;
		const pcm = new Float32Array(this.chunks.reduce((sum, c) => sum + c.length, 0));
		let at = 0;
		for (const c of this.chunks) {
			pcm.set(c, at);
			at += c.length;
		}
		this.close();
		return encodeWav(resample(pcm, rate, TARGET_RATE), TARGET_RATE);
	}

	/** Releases the microphone without keeping the recording. The context is kept for the next one. */
	close() {
		this.closed = true;
		this.source?.disconnect();
		if (this.node) this.node.port.onmessage = null;
		this.node?.disconnect();
		for (const t of this.stream?.getTracks() ?? []) t.stop();
		void this.ctx?.suspend().catch(() => {});
		this.source = null;
		this.node = null;
		this.stream = null;
		this.ctx = null;
		this.chunks = [];
		this.onLevel?.(0);
	}
}

function resample(pcm: Float32Array, from: number, to: number): Float32Array {
	if (from === to) return pcm;
	const out = new Float32Array(Math.floor((pcm.length * to) / from));
	const step = from / to;
	// Each sample averages the input it covers, so higher pitches do not fold back as noise.
	for (let i = 0; i < out.length; i++) {
		const start = Math.floor(i * step);
		const end = Math.max(start + 1, Math.floor((i + 1) * step));
		let sum = 0;
		for (let j = start; j < end; j++) sum += pcm[j] ?? 0;
		out[i] = sum / (end - start);
	}
	return out;
}

export function encodeWav(pcm: Float32Array, rate: number): Blob {
	const view = new DataView(new ArrayBuffer(44 + pcm.length * 2));
	const text = (at: number, s: string) => {
		for (const [i, c] of [...s].entries()) view.setUint8(at + i, c.charCodeAt(0));
	};
	text(0, "RIFF");
	view.setUint32(4, 36 + pcm.length * 2, true);
	text(8, "WAVE");
	text(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, 1, true); // mono
	view.setUint32(24, rate, true);
	view.setUint32(28, rate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	text(36, "data");
	view.setUint32(40, pcm.length * 2, true);
	for (const [i, v] of pcm.entries()) {
		const s = Math.max(-1, Math.min(1, v));
		view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
	}
	return new Blob([view], { type: "audio/wav" });
}
