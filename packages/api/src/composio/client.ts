// The character's apps (Gmail, Google Calendar and so on) through Composio. This app has one user,
// so every account is connected under one fixed Composio user id. Accounts are connected from the
// agent settings, never from within a conversation, so the session's own connect tool is off.

import { Composio } from "@composio/core";
import { MastraProvider, type MastraToolCollection } from "@composio/mastra";
import type { ComposioStatus } from "@nextroom/contracts";
import { BadRequestError, messageOf } from "../lib/errors";
import { composioApiKey } from "../settings/chat";

const USER_ID = "local";

type Session = Awaited<ReturnType<Composio<MastraProvider>["create"]>>;

let cached: {
	key: string;
	session: Promise<Session>;
	tools?: Promise<MastraToolCollection>;
} | null = null;

function client(): Composio<MastraProvider> {
	const apiKey = composioApiKey();
	if (!apiKey) throw new BadRequestError(".env で COMPOSIO_API_KEY を設定してください");
	return new Composio({ apiKey, provider: new MastraProvider() });
}

/** A session limited to `toolkits`, made once for each key and set of toolkits. */
export function composioSession(toolkits: string[]): Promise<Session> {
	const key = `${composioApiKey()}|${[...toolkits].sort().join(",")}`;
	if (cached?.key === key) return cached.session;
	const session = client().create(USER_ID, {
		toolkits,
		manageConnections: false,
		sandbox: { enable: false },
	});
	cached = { key, session };
	// A session that could not be made is made again next time.
	session.catch(() => {
		if (cached?.session === session) cached = null;
	});
	return session;
}

/** The session's tools for the agent, fetched once for each session. */
export function composioSessionTools(toolkits: string[]): Promise<MastraToolCollection> {
	const session = composioSession(toolkits);
	const entry = cached;
	if (entry?.session !== session) return session.then((s) => s.tools());
	entry.tools ??= session.then((s) => s.tools());
	entry.tools.catch(() => {
		if (entry.tools && cached === entry) entry.tools = undefined;
	});
	return entry.tools;
}

/** Drops the session, so the next call makes a new one (after an error that may be the session's). */
export function forgetComposioSession(): void {
	cached = null;
}

/** The toolkits of the settings, and whether an account is connected to each. */
export async function composioStatus(toolkits: string[]): Promise<ComposioStatus> {
	if (!composioApiKey()) return { toolkits: [], error: "Composio の API キーが未設定です" };
	if (!toolkits.length) return { toolkits: [], error: null };
	try {
		const session = await composioSession(toolkits);
		const { items } = await session.toolkits({ toolkits, limit: toolkits.length });
		return {
			toolkits: toolkits.map((slug) => {
				const item = items.find((i) => i.slug.toLowerCase() === slug);
				return {
					slug,
					name: item?.name ?? slug,
					logo: item?.logo ?? null,
					no_auth: item?.isNoAuth ?? false,
					connected: item ? item.isNoAuth || !!item.connection?.isActive : false,
				};
			}),
			error: null,
		};
	} catch (error) {
		forgetComposioSession();
		return { toolkits: [], error: messageOf(error) };
	}
}

/** The page where the user signs in to `toolkit`; Composio sends them back to `callbackUrl`. */
export async function connectComposioToolkit(
	toolkits: string[],
	toolkit: string,
	callbackUrl: string,
): Promise<string> {
	if (!toolkits.includes(toolkit))
		throw new BadRequestError(`${toolkit} は使うアプリに入っていません`);
	try {
		const request = await (await composioSession(toolkits)).authorize(toolkit, { callbackUrl });
		if (!request.redirectUrl) throw new Error("接続ページの URL が返りませんでした");
		return request.redirectUrl;
	} catch (error) {
		if (error instanceof BadRequestError) throw error;
		forgetComposioSession();
		throw new BadRequestError(`Composio に接続できませんでした: ${messageOf(error)}`);
	}
}
