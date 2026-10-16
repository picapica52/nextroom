import type { ChatSettingsPatch, ChatSettingsView } from "@nextroom/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { SettingsBody, SettingsErrorFooter } from "@/components/settings-section";
import { Dot, ErrorNote } from "@/components/status";
import { useChatSettings } from "@/hooks/queries";
import { client, read } from "@/lib/api";
import { qk } from "@/lib/query-keys";

export type ChatSettingsForm = {
	form: ChatSettingsView;
	/** Saves the changes right away, resolving to whether they were saved. */
	set: (changes: ChatSettingsPatch) => Promise<boolean>;
};

/** One page of the chat settings (stored together under `chat`). A change is saved as soon as it is
 *  made; typed text waits for its field's save button. */
export function ChatSettingsPage({ children }: { children: (f: ChatSettingsForm) => ReactNode }) {
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

	if (!saved.data)
		return (
			<SettingsBody>
				<ErrorNote error={saved.error} />
			</SettingsBody>
		);

	return (
		<>
			<SettingsBody>
				{children({
					form: saved.data,
					set: (changes) => {
						qc.setQueryData<ChatSettingsView>(
							qk.chatSettings(),
							(old) => old && ({ ...old, ...changes } as ChatSettingsView),
						);
						return save.mutateAsync(changes).then(
							() => true,
							() => false,
						);
					},
				})}
			</SettingsBody>
			<SettingsErrorFooter error={save.error} />
		</>
	);
}

/** Whether a key of the server's .env is set, with a link to the connection page. */
export function ConnectionStatus({ isSet, name }: { isSet: boolean; name: string }) {
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
			{isSet ? (
				<Dot tone="success">{name} のキーは設定済み</Dot>
			) : (
				<Dot tone="warning">{name} のキーが未設定</Dot>
			)}
			<Link to="/settings/connections">キーは .env で設定（「接続」で確認）</Link>
		</div>
	);
}
