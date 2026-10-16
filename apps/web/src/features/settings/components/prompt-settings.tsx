import { Field, FieldDescription, FieldLabel } from "@nextroom/ui/components/field";
import { SaveInput, SaveTextarea } from "@/components/save-field";
import { SettingsSection } from "@/components/settings-section";
import { ChatSettingsPage } from "./chat-settings";

/** The user's name and the instructions sent with every conversation. */
export default function PromptSettings() {
	return (
		<ChatSettingsPage>
			{({ form, set }) => (
				<>
					<SettingsSection className="gap-5">
						<Field>
							<FieldLabel htmlFor="user-name">あなたの名前</FieldLabel>
							<SaveInput
								id="user-name"
								className="max-w-64"
								value={form.user_name}
								onSave={(user_name) => set({ user_name })}
							/>
							<FieldDescription className="text-xs">
								キャラクターの設定に書かれた {"{{user}}"} がこの名前に置き換わります。
							</FieldDescription>
						</Field>
					</SettingsSection>

					<SettingsSection className="gap-5">
						<Field>
							<FieldLabel htmlFor="custom-prompt">カスタムプロンプト</FieldLabel>
							<SaveTextarea
								id="custom-prompt"
								rows={4}
								className="resize-y text-sm leading-relaxed"
								value={form.custom_prompt}
								onSave={(custom_prompt) => set({ custom_prompt })}
							/>
							<FieldDescription className="text-xs">
								アプリのシステムプロンプトの後ろに追記されます。{"{{char}}"} と {"{{user}}"}{" "}
								も使えます。
							</FieldDescription>
						</Field>
					</SettingsSection>
				</>
			)}
		</ChatSettingsPage>
	);
}
