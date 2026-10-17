import { REASONING_EFFORTS, replyEffortOf } from "@nextroom/contracts";
import { Field, FieldDescription, FieldLabel } from "@nextroom/ui/components/field";
import { SettingsSection } from "@/components/settings-section";
import { SimpleSelect } from "@/components/simple-select";
import { type ChatSettingsForm, ChatSettingsPage } from "./chat-settings";
import { NumberField, SwitchRow } from "./settings-fields";

/** How the reply model writes the characters' replies, and whether they are read aloud. */
export default function ReplySettings() {
	return <ChatSettingsPage>{(f) => <ReplyForm f={f} />}</ChatSettingsPage>;
}

function ReplyForm({ f: { form, set } }: { f: ChatSettingsForm }) {
	return (
		<>
			<SettingsSection
				title="生成のしかた"
				description="すべてのキャラクターの返答に使います。"
				className="grid grid-cols-2 gap-3"
			>
				<NumberField
					id="llm-temperature"
					label="温度"
					description="高いほど言い回しが散らばります（0〜2）"
					value={form.temperature}
					step={0.1}
					min={0}
					max={2}
					onChange={(temperature) => set({ temperature })}
				/>
				<NumberField
					id="llm-max-tokens"
					label="最大トークン数"
					description="1回の返答の長さの上限（空欄でモデルの既定）"
					value={form.max_tokens}
					step={50}
					min={16}
					placeholder="指定なし"
					onChange={(max_tokens) => set({ max_tokens })}
					nullable
				/>
				<Field>
					<FieldLabel htmlFor="llm-effort">Effort</FieldLabel>
					<SimpleSelect<string>
						id="llm-effort"
						value={replyEffortOf(form) ?? null}
						onChange={(effort) => set({ reasoning_effort: effort ?? "" })}
						options={[
							{ value: null, label: "指定なし" },
							...REASONING_EFFORTS[form.provider].map((e) => ({ value: e, label: e })),
						]}
					/>
					<FieldDescription className="text-xs">高いほどよく考えてから返答します</FieldDescription>
				</Field>
			</SettingsSection>

			<SettingsSection>
				<SwitchRow
					id="tts-enabled"
					label="返答を読み上げる"
					description="オフにすると、すべての会話がテキストだけで返答します。"
					checked={form.tts_enabled}
					onChange={(tts_enabled) => set({ tts_enabled })}
				/>
				<SwitchRow
					id="face-changes-enabled"
					label="通話中に表情を変える"
					description="Decisions API が返答に合う表情を選びます。オフにすると、通話中の表情は変わりません。"
					checked={form.face_changes_enabled}
					onChange={(face_changes_enabled) => set({ face_changes_enabled })}
				/>
			</SettingsSection>
		</>
	);
}
