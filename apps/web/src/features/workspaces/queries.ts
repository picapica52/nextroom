import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, client, read, signalled } from "@/lib/api";
import { filesForm, type PickedFile, toBatches } from "@/lib/audio-upload";
import { qk } from "@/lib/query-keys";

const workspaceUrl = (characterId: string) => `/api/workspaces/${encodeURIComponent(characterId)}`;

export const downloadUrl = (characterId: string, path: string) =>
	`${workspaceUrl(characterId)}/download?path=${encodeURIComponent(path)}`;

const workspaceRoute = client.workspaces[":id"];

/** The files of the character's workspace; `version` changes whenever they may have changed. */
export function useWorkspaceFiles(characterId: string, version: number) {
	return useQuery({
		queryKey: qk.workspaceFiles(characterId, version),
		queryFn: ({ signal }) =>
			read(workspaceRoute.files.$get({ param: { id: characterId } }, signalled(signal))),
		placeholderData: keepPreviousData,
	});
}

/** Changes to the files in the character's workspace, each listing them again when done. */
export function useWorkspaceFileActions(characterId: string) {
	const qc = useQueryClient();
	const url = workspaceUrl(characterId);
	const param = { id: characterId };
	const refresh = () => qc.invalidateQueries({ queryKey: qk.workspaceFiles(characterId) });
	const upload = useMutation({
		mutationFn: async ({ dir, files }: { dir: string; files: PickedFile[] }) => {
			for (const batch of toBatches(files)) {
				const body = new FormData();
				body.append("dir", dir);
				await api.post(`${url}/files`, filesForm(batch, body));
			}
		},
		onSettled: refresh,
	});
	const createFolder = useMutation({
		mutationFn: (path: string) => read(workspaceRoute.folders.$post({ param, json: { path } })),
		onSettled: refresh,
	});
	const move = useMutation({
		mutationFn: async (moves: { from: string; to: string }[]) => {
			for (const m of moves) await read(workspaceRoute.move.$post({ param, json: m }));
		},
		onSettled: refresh,
	});
	const remove = useMutation({
		mutationFn: async (paths: string[]) => {
			for (const path of paths)
				await read(workspaceRoute.files.$delete({ param, query: { path } }));
		},
		onSettled: refresh,
	});
	return { upload, createFolder, move, remove, refresh };
}
