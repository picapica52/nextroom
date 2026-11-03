import type {
	AffinityView,
	CharacterAgentPatch,
	CharacterView,
	CharacterVoice,
	InstructionRevision,
	RoutineCreate,
	RoutinePatch,
	RoutineView,
} from "@nextroom/contracts";
import { type UseQueryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, client, fileForm, read, signalled } from "@/lib/api";
import { qk } from "@/lib/query-keys";

/** Query keys of this feature's own data. */
const keys = {
	instructionHistory: (characterId: string) => ["instruction-history", characterId] as const,
	routines: (characterId: string) => ["routines", characterId] as const,
	routineRuns: (routineId: string) => ["routine-runs", routineId] as const,
};

/** Query keys to refresh after a character changes. */
const CHARACTER_KEYS = [qk.characters(), qk.character(), qk.chatSessions()];

/** Image types accepted for the picture. */
export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

export function useCharacters() {
	return useQuery({
		queryKey: qk.characters(),
		queryFn: ({ signal }) => read(client.characters.$get(undefined, signalled(signal))),
	});
}

export function useCharacter(
	id: string | null,
	options: Omit<UseQueryOptions<CharacterView>, "queryKey" | "queryFn"> = {},
) {
	return useQuery({
		queryKey: qk.character(id),
		queryFn: ({ signal }): Promise<CharacterView> =>
			read(client.characters[":id"].$get({ param: { id: id ?? "" } }, signalled(signal))),
		...options,
	});
}

export function useAffinity(characterId: string | null) {
	return useQuery({
		queryKey: qk.affinity(characterId),
		queryFn: ({ signal }): Promise<AffinityView> =>
			read(
				client.characters[":id"].affinity.$get(
					{ param: { id: characterId ?? "" } },
					signalled(signal),
				),
			),
		enabled: !!characterId,
	});
}

export function useResetAffinity(characterId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () =>
			read(client.characters[":id"].affinity.$delete({ param: { id: characterId } })),
		onSuccess: (data) => qc.setQueryData(qk.affinity(characterId), data),
	});
}

export function useBackToFriends(characterId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () =>
			read(
				client.characters[":id"].affinity.$patch({
					param: { id: characterId },
					json: { relationship: "friend" },
				}),
			),
		onSuccess: (data) => qc.setQueryData(qk.affinity(characterId), data),
	});
}

/** After a character changed on the server: shows it at once (when it is given, else fetches it
 *  again) and refreshes the lists that show it. */
export function useCharacterSaved(characterId: string) {
	const qc = useQueryClient();
	return useCallback(
		(data?: CharacterView) => {
			if (data) qc.setQueryData(qk.character(characterId), data);
			else void qc.invalidateQueries({ queryKey: qk.character(characterId) });
			void qc.invalidateQueries({ queryKey: qk.characters() });
			void qc.invalidateQueries({ queryKey: qk.chatSessions() });
		},
		[qc, characterId],
	);
}

/** Saves a change to the character's voice at once, shown before the server answers. */
export function useSaveVoice(characterId: string) {
	const qc = useQueryClient();
	const saved = useCharacterSaved(characterId);
	return useMutation({
		mutationFn: (changes: Partial<CharacterVoice>) =>
			read(
				client.characters[":id"].$patch({ param: { id: characterId }, json: { voice: changes } }),
			),
		onMutate: async (changes) => {
			await qc.cancelQueries({ queryKey: qk.character(characterId) });
			qc.setQueryData<CharacterView>(qk.character(characterId), (c) =>
				c ? { ...c, voice: { ...c.voice, ...changes } } : c,
			);
		},
		onSuccess: (data) => saved(data),
		onError: () => saved(),
	});
}

/** Refreshes everything that shows characters. */
export function useInvalidateCharacters() {
	const qc = useQueryClient();
	return () => Promise.all(CHARACTER_KEYS.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

/** Refreshes the characters, then opens a new one. */
function useOpenCharacter() {
	const invalidate = useInvalidateCharacters();
	const navigate = useNavigate();
	return async (character: CharacterView) => {
		await invalidate();
		navigate(`/characters/${character.id}`);
	};
}

/** Makes a new, blank character and opens its profile. */
export function useCreateCharacter() {
	const invalidate = useInvalidateCharacters();
	const navigate = useNavigate();
	return useMutation({
		mutationFn: () => read(client.characters.$post({ json: {} })),
		onSuccess: async (character) => {
			await invalidate();
			navigate(`/characters/${character.id}/profile`);
		},
	});
}

/** Read a character exported by this app (.zip) into a new character, then open it. */
export function useImportArchive() {
	const open = useOpenCharacter();
	return useMutation({
		mutationFn: (file: File) =>
			api.post<CharacterView>("/api/characters/import/archive", fileForm(file)),
		onSuccess: open,
	});
}

/** Saves a change to the character's own model, tools or instructions. */
export function useSaveAgent(characterId: string) {
	const qc = useQueryClient();
	const saved = useCharacterSaved(characterId);
	return useMutation({
		mutationFn: (changes: CharacterAgentPatch) =>
			read(client.characters[":id"].agent.$patch({ param: { id: characterId }, json: changes })),
		onSuccess: (data) => {
			saved(data);
			void qc.invalidateQueries({ queryKey: keys.instructionHistory(characterId) });
		},
	});
}

export function useInstructionHistory(characterId: string) {
	return useQuery({
		queryKey: keys.instructionHistory(characterId),
		queryFn: ({ signal }): Promise<InstructionRevision[]> =>
			read(
				client.characters[":id"].instructions.history.$get(
					{ param: { id: characterId } },
					signalled(signal),
				),
			),
	});
}

export function useRoutines(characterId: string) {
	return useQuery({
		queryKey: keys.routines(characterId),
		queryFn: ({ signal }): Promise<RoutineView[]> =>
			read(client.routines.$get({ query: { character_id: characterId } }, signalled(signal))),
		// A routine may start, finish or be made by the character at any time.
		refetchInterval: (q) => (q.state.data?.some((r) => r.running) ? 2000 : 15_000),
	});
}

export function useRoutineRuns(routineId: string, running: boolean) {
	return useQuery({
		queryKey: keys.routineRuns(routineId),
		queryFn: ({ signal }) =>
			read(client.routines[":id"].runs.$get({ param: { id: routineId } }, signalled(signal))),
		refetchInterval: running ? 2000 : false,
	});
}

/** Creating, changing, deleting and running the character's routines. */
export function useRoutineActions(characterId: string) {
	const qc = useQueryClient();
	const refresh = (routineId?: string) => {
		void qc.invalidateQueries({ queryKey: keys.routines(characterId) });
		if (routineId) void qc.invalidateQueries({ queryKey: keys.routineRuns(routineId) });
	};
	return {
		create: useMutation({
			mutationFn: (input: Omit<RoutineCreate, "character_id">) =>
				read(client.routines.$post({ json: { ...input, character_id: characterId } })),
			onSuccess: () => refresh(),
		}),
		update: useMutation({
			mutationFn: ({ id, patch }: { id: string; patch: RoutinePatch }) =>
				read(client.routines[":id"].$patch({ param: { id }, json: patch })),
			onSuccess: (r) => refresh(r.id),
		}),
		remove: useMutation({
			mutationFn: (id: string) => read(client.routines[":id"].$delete({ param: { id } })),
			onSuccess: () => refresh(),
		}),
		run: useMutation({
			mutationFn: (id: string) => read(client.routines[":id"].run.$post({ param: { id } })),
			onSuccess: (r) => refresh(r.id),
		}),
	};
}
