// What the engine reports: the speech.cpp server the user runs and its models, and the GPU jobs.

import type { JobView } from "./jobs";

/** The speech.cpp server at the settings' address, and the models it holds. */
export interface SpeechServerStatus {
	url: string;
	/** It answered. */
	ok: boolean;
	/** Why it could not be reached. */
	error: string | null;
	/** The names of the models it holds for speech synthesis and transcription. */
	tts: string | null;
	asr: string | null;
}

export interface EngineStatus {
	speech: SpeechServerStatus;
	/** Conversations whose browser is open. */
	browsers: number;
	/** The engine's GPU job (synthesis, transcription, voice files), cancelled at /api/engine/jobs. */
	engine_job: JobView | null;
	current_job: JobView | null;
}

/** A model of the speech.cpp server's catalog the app offers, which the server fetches and
 *  loads: the Irodori-TTS models, and every recognition model that writes Japanese. */
export interface SpeechModel {
	/** Its name in the catalog. */
	name: string;
	/** Its Hugging Face repository's name, which tells the model and its size apart. */
	label: string;
	/** Its languages and weight type, as the catalog gives them. */
	description: string;
	/** speech.cpp names it the one to start with for Japanese. */
	recommended: boolean;
	task: "synthesis" | "recognition";
	/** The bytes of its file, and how much of it the server has. */
	size: number;
	fetched_bytes: number;
	fetched: boolean;
	/** The server holds it for its task. */
	held: boolean;
	/** A load the app asked for: fetching (with its progress) or loading, or how it failed. */
	loading: "fetching" | "loading" | null;
	error: string | null;
}

export interface SpeechModels {
	/** The server answered; `error` says why not. */
	ok: boolean;
	error: string | null;
	models: SpeechModel[];
}
