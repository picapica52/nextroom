// The Discord bot, logged in while the server runs and the settings have it on. It needs no
// server of its own: it connects out to Discord. In a server it was added to, `/join` brings the
// character into the voice channel of whoever typed it, and `/leave` sends it out; it also
// leaves once nobody is left in the channel. One channel at a time, since the character has one
// conversation.

import type { DiscordStatus } from "@nextroom/contracts";
import {
	type ChatInputCommandInteraction,
	Client,
	Events,
	GatewayIntentBits,
	type Guild,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";

import { getCharacter } from "../characters/store";
import { messageOf } from "../lib/errors";
import { discordToken, loadDiscordSettings } from "./settings";
import { VoiceSession } from "./voice-session";

const COMMANDS = [
	new SlashCommandBuilder()
		.setName("join")
		.setDescription("キャラクターをあなたのボイスチャンネルに呼びます"),
	new SlashCommandBuilder()
		.setName("leave")
		.setDescription("キャラクターをボイスチャンネルから帰します"),
].map((command) => command.toJSON());

const PERMISSIONS =
	PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect | PermissionFlagsBits.Speak;

let client: Client | null = null;
let session: VoiceSession | null = null;
let status: DiscordStatus = {
	state: "off",
	bot_name: null,
	invite_url: null,
	channel: null,
	error: null,
};

export function discordStatus(): DiscordStatus {
	return {
		...status,
		channel: session ? { guild: session.guild.name, name: session.channelName } : null,
	};
}

/** Logs the bot in when the settings have it on and a token; logs it out first if it was in. */
export async function restartDiscordBot(): Promise<void> {
	await stopDiscordBot();
	const settings = loadDiscordSettings();
	const token = discordToken(settings);
	if (!settings.enabled || !token) return;
	const bot = new Client({
		intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
	});
	client = bot;
	status = { ...status, state: "connecting", error: null };
	bot.once(Events.ClientReady, async (ready) => {
		status = {
			...status,
			state: "ready",
			bot_name: ready.user.tag,
			invite_url: `https://discord.com/oauth2/authorize?client_id=${ready.user.id}&scope=bot%20applications.commands&permissions=${PERMISSIONS}`,
		};
		for (const guild of ready.guilds.cache.values()) await registerCommands(guild);
	});
	bot.on(Events.GuildCreate, (guild) => void registerCommands(guild));
	bot.on(Events.InteractionCreate, (interaction) => {
		if (interaction.isChatInputCommand()) void answer(interaction);
	});
	bot.on(Events.VoiceStateUpdate, (before) => {
		if (session && before.channelId === session.channelId && !session.humans().size)
			session.close();
	});
	bot.on(Events.Error, (error) => console.warn("Discord:", error.message));
	try {
		await bot.login(token);
	} catch (error) {
		if (client === bot) {
			client = null;
			status = { ...status, state: "error", error: messageOf(error) };
		}
		void bot.destroy();
	}
}

export async function stopDiscordBot(): Promise<void> {
	session?.close();
	const bot = client;
	client = null;
	status = { state: "off", bot_name: null, invite_url: null, channel: null, error: null };
	await bot?.destroy();
}

/** Commands of a server answer at once, unlike global ones. */
async function registerCommands(guild: Guild) {
	try {
		await guild.commands.set(COMMANDS);
	} catch (error) {
		console.warn(`Discord: could not add the commands to ${guild.name}:`, messageOf(error));
	}
}

async function answer(interaction: ChatInputCommandInteraction) {
	const reply = (content: string) =>
		interaction.replied || interaction.deferred
			? interaction.editReply(content)
			: interaction.reply({ content, flags: MessageFlags.Ephemeral });
	try {
		if (interaction.commandName === "leave") {
			if (!session || session.guild.id !== interaction.guildId)
				return void (await reply("ボイスチャンネルには入っていません"));
			session.close();
			return void (await reply("ボイスチャンネルから退出しました"));
		}
		if (interaction.commandName !== "join") return;
		const characterId = loadDiscordSettings().character_id;
		if (!characterId) return void (await reply("アプリの設定で、話すキャラクターを選んでください"));
		const character = getCharacter(characterId);
		const channel = interaction.guild?.voiceStates.cache.get(interaction.user.id)?.channel;
		if (!channel) return void (await reply("先にボイスチャンネルに入ってから呼んでください"));
		if (!channel.joinable) return void (await reply("このボイスチャンネルに入る権限がありません"));
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		if (session?.channelId !== channel.id) {
			session?.close();
			const next = new VoiceSession(channel, () => {
				if (session === next) session = null;
			});
			session = next;
			await next.ready();
		}
		await reply(`${character.persona.name} が ${channel.name} に参加しました`);
	} catch (error) {
		await reply(`うまくいきませんでした: ${messageOf(error)}`).catch(() => {});
	}
}
