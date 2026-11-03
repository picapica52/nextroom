import { SettingsErrorFooter } from "@/components/settings-section";
import { ErrorNote } from "@/components/status";
import { useDiscordSettings, useSaveDiscordSettings } from "@/features/discord/queries";
import { useSaveSlackSettings, useSlackSettings } from "@/features/slack/queries";
import { DiscordSection } from "./discord-settings";
import { SettingsPageBody } from "./settings-layout";
import { SlackSection } from "./slack-settings";

const saved = (p: Promise<unknown>) =>
	p.then(
		() => true,
		() => false,
	);

/** The bots that bring a character into Discord and Slack. A change is saved as soon as it is
 *  made. */
export default function MessagingSettings() {
	const discord = useDiscordSettings();
	const saveDiscord = useSaveDiscordSettings();
	const slack = useSlackSettings();
	const saveSlack = useSaveSlackSettings();
	return (
		<>
			<SettingsPageBody>
				{discord.data ? (
					<DiscordSection
						form={discord.data}
						set={(patch) => saved(saveDiscord.mutateAsync(patch))}
					/>
				) : (
					<ErrorNote error={discord.error} />
				)}
				{slack.data ? (
					<SlackSection form={slack.data} set={(patch) => saved(saveSlack.mutateAsync(patch))} />
				) : (
					<ErrorNote error={slack.error} />
				)}
			</SettingsPageBody>
			<SettingsErrorFooter error={saveDiscord.error ?? saveSlack.error} />
		</>
	);
}
