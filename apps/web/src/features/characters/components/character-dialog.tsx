import { PERSONA_SOURCE_EXTENSIONS, type Persona } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { RouteDialog, RouteDialogClose } from "@/components/route-dialog";
import { SettingsBody, SettingsSaveFooter, SettingsSection } from "@/components/settings-section";
import { ErrorNote } from "@/components/status";
import { PaneHeader } from "@/components/two-pane";
import { VoicePreview } from "@/components/voice-preview";
import { MemoryView } from "@/features/agent/components/memory-view";
import { useChatSessions } from "@/features/chat/queries";
import { client, read } from "@/lib/api";
import { useCharacter, useCharacterSaved, useInvalidateCharacters, useSaveVoice } from "../queries";
import { EDIT_TABS, TAB_INFO, TABS, type Tab } from "../tabs";
import { AffinitySection } from "./affinity";
import { CharacterExpressions } from "./character-expressions";
import { CharacterExtractDialog } from "./character-extract-dialog";
import { CharacterProfileForm } from "./character-profile-form";
import { CharacterSidebar } from "./character-sidebar";
import { CharacterVoiceForm } from "./character-voice-form";

/** A character's settings, over its conversation. */
export default function CharacterDialog() {
	const { id = "", tab = "profile" } = useParams();
	const current = TABS.find((t) => t.id === tab)?.id ?? "profile";
	return <CharacterDetail key={id} characterId={id} tab={current} />;
}

function CharacterDetail({ characterId, tab }: { characterId: string; tab: Tab }) {
	const navigate = useNavigate();
	const invalidateCharacters = useInvalidateCharacters();
	const { data: character, error } = useCharacter(characterId);
	const sessions = useChatSessions();
	const chat = sessions.data?.find((s) => s.id === characterId);
	// Unsaved edits of the profile; null shows the saved one. The voice is saved as it changes.
	const [draft, setDraft] = useState<Persona | null>(null);
	const [extracting, setExtracting] = useState(false);

	const saved = useCharacterSaved(characterId);
	const save = useMutation({
		mutationFn: (persona: Persona) =>
			read(client.characters[":id"].$patch({ param: { id: characterId }, json: { persona } })),
		onSuccess: (data) => {
			saved(data);
			setDraft(null);
		},
	});
	const saveVoice = useSaveVoice(characterId);
	const remove = useMutation({
		mutationFn: () => read(client.characters[":id"].$delete({ param: { id: characterId } })),
		// Closes first: refreshing would wait for the deleted character, which now fails.
		onSuccess: () => {
			navigate("/chat");
			void invalidateCharacters();
		},
	});
	const close = () => navigate(`/chat/${characterId}`);

	if (error)
		return (
			<RouteDialog title="キャラクター" onClose={close} nav={null}>
				<div className="flex justify-end p-2">
					<RouteDialogClose onClose={close} />
				</div>
				<div className="p-4">
					<ErrorNote error={error} />
				</div>
			</RouteDialog>
		);
	if (!character) return null;

	const persona = draft ?? character.persona;
	const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(character.persona);
	const setPersona = (changes: Partial<Persona>) => setDraft({ ...persona, ...changes });

	const download = async () => {
		if (dirty) await save.mutateAsync(persona);
		const a = document.createElement("a");
		a.href = `/api/characters/${characterId}/export`;
		a.click();
	};

	const tabInfo = TAB_INFO[tab];
	const tabLabel = TABS.find((t) => t.id === tab)?.label;

	return (
		<RouteDialog
			title={`${character.persona.name}の設定`}
			onClose={close}
			nav={
				<CharacterSidebar
					characterId={characterId}
					character={character}
					tab={tab}
					messageCount={chat?.message_count ?? 0}
					onChange={saved}
					onExport={() => void download()}
					onRemove={() => remove.mutate()}
					removeError={remove.error}
				/>
			}
		>
			<PaneHeader icon={tabInfo.icon} title={tabLabel} description={tabInfo.description}>
				<RouteDialogClose onClose={close} />
			</PaneHeader>

			<SettingsBody>
				{tab === "profile" && (
					<>
						<SettingsSection
							title="資料から読み取る"
							description="設定資料や本文、JSON などから、下の項目を AI が埋めます。保存するまで反映されません。"
							action={
								<Button variant="secondary" onClick={() => setExtracting(true)}>
									<Sparkles />
									資料から読み取る
								</Button>
							}
						>
							<p className="m-0 text-xs text-muted-foreground">
								{PERSONA_SOURCE_EXTENSIONS.join(" / ")}{" "}
								を読めます。補足説明で、誰の設定を取り出すかなどを指定できます。
							</p>
						</SettingsSection>
						<CharacterExtractDialog
							characterId={characterId}
							persona={persona}
							open={extracting}
							onOpenChange={setExtracting}
							onApply={setPersona}
						/>
						<CharacterProfileForm
							characterId={characterId}
							persona={persona}
							onChange={setPersona}
						/>
					</>
				)}

				{tab === "voice" && (
					<>
						<CharacterVoiceForm
							character={character}
							value={character.voice}
							update={(changes) => saveVoice.mutate(changes)}
							error={saveVoice.error}
						/>
						<SettingsSection title="試聴">
							<VoicePreview
								characterId={characterId}
								settings={character.voice}
								initialText="こんにちは。今日はいい天気ですね。"
							/>
						</SettingsSection>
					</>
				)}

				{tab === "expressions" && <CharacterExpressions character={character} onChange={saved} />}

				{tab === "memory" && (
					<>
						<AffinitySection characterId={characterId} name={character.persona.name} />
						<MemoryView characterId={characterId} />
					</>
				)}
			</SettingsBody>

			{EDIT_TABS.includes(tab) && (
				<SettingsSaveFooter
					dirty={dirty}
					pending={save.isPending}
					error={save.error}
					onRevert={() => setDraft(null)}
					onSave={() => save.mutate(persona)}
				/>
			)}
		</RouteDialog>
	);
}
