// Signing in to the subscriptions the replies can use (ChatGPT, Claude, GitHub Copilot, SuperGrok),
// through pi's OAuth flows. The credentials are kept in the database's `credentials` table and
// refreshed by pi when they expire.
//
// A sign-in runs on the server while the screen polls it: the screen shows the page to open and
// the code to enter there (device code), or the page and a field for the code it gives back.

import type {
	AuthEvent,
	AuthInteraction,
	AuthPrompt,
	Credential,
	CredentialInfo,
	CredentialStore,
} from "@earendil-works/pi-ai";
import type {
	SubscriptionLogin,
	SubscriptionProvider,
	SubscriptionStatus,
} from "@nextroom/contracts";
import { SUBSCRIPTION_PROVIDERS } from "@nextroom/contracts";
import { z } from "zod";
import { appDb, deleteDoc, hasDoc, readDoc, writeDoc } from "../lib/db";
import { BadRequestError, messageOf, NotFoundError } from "../lib/errors";
import { newId } from "../lib/storage";
import { piModels } from "./providers";

/** pi's provider of each subscription. */
export const PI_PROVIDERS = {
	chatgpt: "openai-codex",
	claude: "anthropic",
	copilot: "github-copilot",
	grok: "xai",
} as const satisfies Record<SubscriptionProvider, string>;

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

export const isSignedIn = (provider: SubscriptionProvider) =>
	credentials.has(PI_PROVIDERS[provider]);

export const subscriptionStatus = (): SubscriptionStatus[] =>
	SUBSCRIPTION_PROVIDERS.map((provider) => ({ provider, signed_in: isSignedIn(provider) }));

const LOGIN_TIMEOUT_MS = 15 * 60 * 1000;
/** How long a finished sign-in can still be asked about. */
const KEEP_FINISHED_MS = 5 * 60 * 1000;

interface Login {
	view: SubscriptionLogin;
	abort: AbortController;
	/** Resolves the pasted code the flow is waiting for. */
	answer: ((code: string) => void) | null;
}

const logins = new Map<string, Login>();

/** The sign-in methods pi offers; the one that works without a browser on this PC is chosen. */
function choose(prompt: Extract<AuthPrompt, { type: "select" }>): string {
	const device = prompt.options.find((o) => /device/i.test(`${o.id} ${o.label}`));
	return (device ?? prompt.options[0])?.id ?? "";
}

function interaction(login: Login): AuthInteraction {
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
			}
		},
		prompt(prompt: AuthPrompt): Promise<string> {
			if (prompt.type === "select") return Promise.resolve(choose(prompt));
			// GitHub Copilot asks for an Enterprise domain: github.com.
			if (prompt.type === "text") return Promise.resolve("");
			if (prompt.type === "secret")
				return Promise.reject(new Error("このサインインには対応していません"));
			view.needs_code = true;
			return new Promise((resolve, reject) => {
				const signal = prompt.signal ?? login.abort.signal;
				const stop = () => {
					login.answer = null;
					view.needs_code = false;
					reject(signal.reason ?? new Error("中断されました"));
				};
				if (signal.aborted) return stop();
				signal.addEventListener("abort", stop, { once: true });
				login.answer = (code) => {
					signal.removeEventListener("abort", stop);
					login.answer = null;
					view.needs_code = false;
					resolve(code);
				};
			});
		},
	};
}

function finish(id: string, login: Login, status: SubscriptionLogin["status"], error?: unknown) {
	if (login.view.status !== "pending") return;
	login.view.status = status;
	login.view.needs_code = false;
	if (error !== undefined) login.view.error = messageOf(error);
	login.abort.abort();
	setTimeout(() => {
		if (logins.get(id) === login) logins.delete(id);
	}, KEEP_FINISHED_MS);
}

/** Starts signing in to `provider`; the screen follows it with subscriptionLogin(). */
export async function startSubscriptionLogin(
	provider: SubscriptionProvider,
): Promise<SubscriptionLogin> {
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
			needs_code: false,
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
		.login(PI_PROVIDERS[provider], "oauth", interaction(login), { agentName: "nextroom" })
		.then(() => finish(id, login, "done"))
		.catch((error) => finish(id, login, login.abort.signal.aborted ? "cancelled" : "error", error))
		.finally(() => clearTimeout(timeout));
	// The first page or code usually comes at once; the screen polls for the rest.
	await new Promise((resolve) => setTimeout(resolve, 1500));
	return { ...login.view };
}

function loginOf(id: string): Login {
	const login = logins.get(id);
	if (!login) throw new NotFoundError("このサインインはもう終わっています");
	return login;
}

export const subscriptionLogin = (id: string): SubscriptionLogin => ({ ...loginOf(id).view });

/** The code the sign-in page gave back, pasted by the user. */
export function answerSubscriptionLogin(id: string, code: string): SubscriptionLogin {
	const login = loginOf(id);
	if (!login.answer) throw new BadRequestError("コードを待っていません");
	login.answer(code);
	return { ...login.view };
}

export function cancelSubscriptionLogin(id: string): SubscriptionLogin {
	const login = loginOf(id);
	finish(id, login, "cancelled");
	return { ...login.view };
}

export async function signOut(provider: SubscriptionProvider): Promise<void> {
	await credentials.delete(PI_PROVIDERS[provider]);
}
