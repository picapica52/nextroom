import { Label } from "@nextroom/ui/components/label";
import { SaveInput, SaveTextarea } from "@/components/save-field";
import { ChatSettingsPage } from "./chat-settings";
import { SettingsBlock, SettingsGroup, SettingsRow } from "./settings-layout";

/** The user's name and the instructions sent to every character. */
export default function GeneralSettings() {
	return (
		<ChatSettingsPage>
			{({ form, set }) => (
				<SettingsGroup>
					<SettingsRow
						label="あなたの名前"
						htmlFor="user-name"
						control={
							<div className="flex w-64 max-w-full">
								<SaveInput
									id="user-name"
									value={form.user_name}
									onSave={(user_name) => set({ user_name })}
								/>
							</div>
						}
					/>
					<SettingsBlock>
						<div className="flex flex-col gap-0.5">
							<Label htmlFor="custom-prompt" className="text-sm font-normal">
								すべてのキャラクターへの指示
							</Label>
							<p className="m-0 text-xs text-muted-foreground">
								{"{{char}}"} と {"{{user}}"} が使えます
							</p>
						</div>
						<SaveTextarea
							id="custom-prompt"
							rows={5}
							className="resize-y text-sm leading-relaxed"
							value={form.custom_prompt}
							onSave={(custom_prompt) => set({ custom_prompt })}
						/>
					</SettingsBlock>
				</SettingsGroup>
			)}
		</ChatSettingsPage>
	);
}
