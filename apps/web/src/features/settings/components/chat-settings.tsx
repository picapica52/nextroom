import type { ChatSettingsPatch, ChatSettingsView } from "@nextroom/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useChatSettings } from "@/hooks/queries";
import { client, read } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { SettingsPage } from "./settings-layout";

export type ChatSettingsForm = {
	form: ChatSettingsView;
	/** Saves the changes right away, resolving to whether they were saved. */
	set: (changes: ChatSettingsPatch) => Promise<boolean>;
};

/** The chat settings (stored together under `chat`), saved as soon as a change is made. */
export function useChatSettingsForm() {
	const qc = useQueryClient();
	const saved = useChatSettings();
	const save = useMutation({
		mutationFn: (patch: ChatSettingsPatch) => read(client.chat.settings.$patch({ json: patch })),
		onSuccess: (data) => {
			qc.setQueryData(qk.chatSettings(), data);
			qc.invalidateQueries({ queryKey: qk.agentSettings() });
		},
		onError: () => qc.invalidateQueries({ queryKey: qk.chatSettings() }),
	});
	const set: ChatSettingsForm["set"] = (changes) => {
		qc.setQueryData<ChatSettingsView>(
			qk.chatSettings(),
			(old) => old && ({ ...old, ...changes } as ChatSettingsView),
		);
		return save.mutateAsync(changes).then(
			() => true,
			() => false,
		);
	};
	return {
		f: saved.data ? { form: saved.data, set } : undefined,
		loadError: saved.error,
		saveError: save.error,
	};
}

/** One page of the chat settings. Typed text waits for its field's save button. */
export function ChatSettingsPage({ children }: { children: (f: ChatSettingsForm) => ReactNode }) {
	const { f, loadError, saveError } = useChatSettingsForm();
	return (
		<SettingsPage loadError={f ? null : loadError} saveError={saveError}>
			{f && children(f)}
		</SettingsPage>
	);
}
