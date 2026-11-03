// Signing in to pi's providers the way pi offers for each: an API key (or whatever else it asks),
// or a subscription's sign-in (OAuth). The credentials are kept in the database's `credentials`
// table, by pi's provider id, and refreshed by pi when they expire.
//
// A sign-in runs on the server while the screen polls it: the screen shows the page to open and
// the code to enter there (device code), or what the sign-in asks (the code the page gives back,
// a key, a choice).

import type {
	AuthEvent,
	AuthInteraction,
	AuthPrompt,
	AuthType,
	Credential,
	CredentialInfo,
	CredentialStore,
} from "@earendil-works/pi-ai";
import type { LlmProvider, ProviderLogin, ProviderStatus } from "@nextroom/contracts";
import { z } from "zod";
import { appDb, deleteDoc, hasDoc, readDoc, writeDoc } from "../lib/db";
import { BadRequestError, messageOf, NotFoundError } from "../lib/errors";
import { newId } from "../lib/storage";
import { readSettingsSection, writeSettingsSection } from "../settings/file";
import { piModels, providerIds, providerName } from "./providers";

/** pi's credentials, as they are kept: an API key or an OAuth token with whatever else pi needs. */
const credentialSchema = z.looseObject({ type: z.enum(["api_key", "oauth"]) });

/** The credentials in the database. Changes run one at a time, as pi expects of a store. */
class DbCredentialStore implements CredentialStore {
	private chain: Promise<unknown> = Promise.resolve();

	private get(providerId: string): Credential | undefined {
		return (readDoc("credentials", providerId, credentialSchema) as Credential | null) ?? undefined;
	}

	has(providerId: string): boolean {
		return hasDoc("credentials", providerId);
	}

	async read(providerId: string) {
		await this.chain;
		return this.get(providerId);
	}

	async list(): Promise<readonly CredentialInfo[]> {
		await this.chain;
		return appDb()
			.query<{ key: string; data: string }, []>(`SELECT key, data FROM credentials`)
			.all()
			.map((r) => ({ providerId: r.key, type: (JSON.parse(r.data) as Credential).type }));
	}

	modify(
		providerId: string,
		fn: (current: Credential | undefined) => Promise<Credential | undefined>,
	): Promise<Credential | undefined> {
		const run = this.chain.then(async () => {
			const current = this.get(providerId);
			const next = await fn(current);
			if (next) writeDoc("credentials", providerId, credentialSchema, next as never);
			return next ?? current;
		});
		this.chain = run.catch(() => {});
		return run;
	}

	async delete(providerId: string): Promise<void> {
		const run = this.chain.then(() => deleteDoc("credentials", providerId));
		this.chain = run.catch(() => {});
		await run;
	}
}

export const credentials = new DbCredentialStore();

const LOGIN_TIMEOUT_MS = 15 * 60 * 1000;
/** How long a finished sign-in can still be asked about. */
const KEEP_FINISHED_MS = 5 * 60 * 1000;

interface Login {
	view: ProviderLogin;
	abort: AbortController;
	/** Resolves the answer the flow is waiting for. */
	answer: ((code: string) => void) | null;
}

const logins = new Map<string, Login>();

/** The sign-in methods pi offers; one that works without a browser on the server is chosen (a
 *  device code, or a code to copy from the page), since the browser login comes back to
 *  localhost, which is the user's own device when the app runs elsewhere. */
function choose(prompt: Extract<AuthPrompt, { type: "select" }>): string {
	const headless = prompt.options.find((o) => /device|headless/i.test(`${o.id} ${o.label}`));
	return (headless ?? prompt.options[0])?.id ?? "";
}

function ask(login: Login, prompt: AuthPrompt): Promise<string> {
	const { view } = login;
	view.prompt = {
		type: prompt.type,
		message: prompt.message,
		placeholder: ("placeholder" in prompt && prompt.placeholder) || null,
		options:
			prompt.type === "select"
				? prompt.options.map((o) => ({
						id: o.id,
						label: o.label,
						description: o.description ?? null,
					}))
				: [],
	};
	return new Promise((resolve, reject) => {
		const signal = prompt.signal ?? login.abort.signal;
		const stop = () => {
			login.answer = null;
			view.prompt = null;
			reject(signal.reason ?? new Error("中断されました"));
		};
		if (signal.aborted) return stop();
		signal.addEventListener("abort", stop, { once: true });
		login.answer = (code) => {
			signal.removeEventListener("abort", stop);
			login.answer = null;
			view.prompt = null;
			resolve(code);
		};
	});
}

function interaction(login: Login, type: AuthType): AuthInteraction {
	const { view } = login;
	return {
		signal: login.abort.signal,
		notify(event: AuthEvent) {
			// The screen words the steps itself; pi's instructions are for a terminal.
			if (event.type === "auth_url") {
				view.url = event.url;
			} else if (event.type === "device_code") {
				view.url = event.verificationUri;
				view.user_code = event.userCode;
			} else {
				view.message = event.message;
				if (event.type === "info" && event.links?.[0]) view.url ??= event.links[0].url;
			}
		},
		prompt(prompt: AuthPrompt): Promise<string> {
			if (prompt.type === "select" && type === "oauth") return Promise.resolve(choose(prompt));
			return ask(login, prompt);
		},
	};
}

function finish(id: string, login: Login, status: ProviderLogin["status"], error?: unknown) {
	if (login.view.status !== "pending") return;
	login.view.status = status;
	login.view.prompt = null;
	if (error !== undefined) login.view.error = messageOf(error);
	login.abort.abort();
	setTimeout(() => {
		if (logins.get(id) === login) logins.delete(id);
	}, KEEP_FINISHED_MS);
}

/** This installation's id, made the first time a sign-in asks for it. */
function deviceId(): string {
	const saved = readSettingsSection("install")?.device_id;
	if (saved) return saved;
	const id = crypto.randomUUID();
	writeSettingsSection("install", { device_id: id });
	return id;
}

/** Starts signing in to `provider`; the screen follows it with providerLogin(). */
async function startLogin(provider: LlmProvider, type: AuthType): Promise<ProviderLogin> {
	for (const [id, other] of logins) {
		if (other.view.provider === provider) finish(id, other, "cancelled");
	}
	const id = newId("login_");
	const login: Login = {
		view: {
			id,
			provider,
			status: "pending",
			url: null,
			user_code: null,
			prompt: null,
			message: null,
			error: null,
		},
		abort: new AbortController(),
		answer: null,
	};
	logins.set(id, login);
	const timeout = setTimeout(
		() => finish(id, login, "error", "時間内にサインインが終わりませんでした"),
		LOGIN_TIMEOUT_MS,
	);
	piModels()
		.login(provider, type, interaction(login, type), {
			agentName: "nextroom",
			getDeviceId: deviceId,
		})
		.then(() => finish(id, login, "done"))
		.catch((error) => finish(id, login, login.abort.signal.aborted ? "cancelled" : "error", error))
		.finally(() => clearTimeout(timeout));
	// The first page, code or question usually comes at once; the screen polls for the rest.
	await new Promise((resolve) => setTimeout(resolve, type === "api_key" ? 200 : 1500));
	return { ...login.view };
}

function knownProvider(provider: LlmProvider) {
	const found = providerIds().includes(provider) ? piModels().getProvider(provider) : undefined;
	if (!found) throw new NotFoundError(`プロバイダー ${provider} はありません`);
	return found;
}

/** Signs in to a provider, with an API key (or whatever else it asks) or OAuth. */
export function startProviderLogin(provider: LlmProvider, type: AuthType): Promise<ProviderLogin> {
	const found = knownProvider(provider);
	if (!(type === "oauth" ? found.auth.oauth : found.auth.apiKey?.login))
		throw new BadRequestError(`${found.name} はこの方法ではサインインできません`);
	return startLogin(found.id, type);
}

/** The providers, and whether each can be used now. */
export async function providerStatus(): Promise<ProviderStatus[]> {
	const models = piModels();
	return Promise.all(
		providerIds().map(async (id) => {
			const provider = models.getProvider(id);
			const check = await models.checkAuth(id).catch(() => undefined);
			const stored = await credentials.read(id);
			return {
				id,
				name: providerName(id),
				auth: {
					api_key: provider?.auth.apiKey?.login ? provider.auth.apiKey.name : null,
					oauth: provider?.auth.oauth?.name ?? null,
				},
				configured: Boolean(check),
				source: check?.source ?? null,
				stored: stored?.type ?? null,
			};
		}),
	);
}

/** Removes what was entered for the provider (its key, or the sign-in); the environment's stay. */
export async function forgetProvider(provider: LlmProvider): Promise<ProviderStatus[]> {
	await credentials.delete(knownProvider(provider).id);
	return providerStatus();
}

function loginOf(id: string): Login {
	const login = logins.get(id);
	if (!login) throw new NotFoundError("このサインインはもう終わっています");
	return login;
}

export const providerLogin = (id: string): ProviderLogin => ({ ...loginOf(id).view });

/** The user's answer to what the sign-in asks: the code the page gave back, a key, a choice; only
 *  a text may be left empty. */
export function answerLogin(id: string, code: string): ProviderLogin {
	const login = loginOf(id);
	if (!login.answer) throw new BadRequestError("入力を待っていません");
	if (!code && login.view.prompt?.type !== "text") throw new BadRequestError("入力してください");
	login.answer(code);
	return { ...login.view };
}

export function cancelLogin(id: string): ProviderLogin {
	const login = loginOf(id);
	finish(id, login, "cancelled");
	return { ...login.view };
}
