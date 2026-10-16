import type {
	CharacterView,
	Expression,
	ExpressionBatch,
	ExpressionBatchView,
	ExpressionTag,
	ExpressionTagGuess,
	NeutralGenerate,
} from "@nextroom/contracts";
import { isJobActive } from "@nextroom/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, client, fileForm, read, signalled } from "@/lib/api";
import { POLL } from "@/lib/constants";
import { qk } from "@/lib/query-keys";
import { useCharacterSaved } from "./queries";

export type Tagged = { character: CharacterView; guess: ExpressionTagGuess };

/** How far a batch has got, and the face (or tag) it is on. */
export interface Progress {
	key: string;
	done: number;
	total: number;
}

/** Adding faces, and cutting out, tagging and drawing them in batches, one face at a time. */
export function useExpressionActions(
	character: CharacterView,
	onChange: (c: CharacterView) => void,
) {
	const upload = useMutation({
		// One after another, so each lands in the order chosen.
		mutationFn: async (files: File[]) => {
			let latest: CharacterView | null = null;
			for (const file of files) {
				latest = await api.post<CharacterView>(
					`/api/characters/${character.id}/expressions`,
					fileForm(file),
				);
				onChange(latest);
			}
			return latest;
		},
	});
	const [cutting, setCutting] = useState<Progress | null>(null);
	const cutoutAll = useMutation({
		// One at a time, as the engine's GPU queue runs them anyway, so each card shows its turn.
		mutationFn: async (targets: Expression[]) => {
			for (const [done, e] of targets.entries()) {
				setCutting({ key: e.id, done, total: targets.length });
				onChange(
					await read(
						client.characters[":id"].expressions[":eid"].cutout.$post({
							param: { id: character.id, eid: e.id },
						}),
					),
				);
			}
		},
		onSettled: () => setCutting(null),
	});
	// What the Decisions API chose for each face, shown until the tag is changed by hand.
	const [guesses, setGuesses] = useState<Record<string, ExpressionTagGuess>>({});
	const tagged = (id: string, result: Tagged) => {
		setGuesses((g) => ({ ...g, [id]: result.guess }));
		onChange(result.character);
	};
	const [tagging, setTagging] = useState<Progress | null>(null);
	const tagAll = useMutation({
		mutationFn: async (targets: Expression[]) => {
			for (const [done, e] of targets.entries()) {
				setTagging({ key: e.id, done, total: targets.length });
				tagged(
					e.id,
					await read(
						client.characters[":id"].expressions[":eid"].tag.$post({
							param: { id: character.id, eid: e.id },
						}),
					),
				);
			}
		},
		onSettled: () => setTagging(null),
	});
	const clearTags = useMutation({
		mutationFn: () =>
			read(client.characters[":id"]["expression-tags"].$delete({ param: { id: character.id } })),
		onSuccess: (c) => {
			setGuesses({});
			onChange(c);
		},
	});
	const batch = useExpressionBatch(character.id);
	const locked = cutoutAll.isPending || tagAll.isPending || clearTags.isPending || batch.running;

	return {
		upload,
		cutoutAll,
		cutting,
		tagAll,
		tagging,
		guesses,
		tagged,
		clearTags,
		batch,
		locked,
	};
}

/** Changes to one face: its tag, cutting it out (or back), tagging, drawing it again, removing it. */
export function useExpressionCardActions(
	characterId: string,
	expressionId: string,
	onChange: (c: CharacterView) => void,
	onTagged: (result: Tagged) => void,
) {
	const expression = client.characters[":id"].expressions[":eid"];
	const param = { id: characterId, eid: expressionId };
	const update = useMutation({
		mutationFn: (patch: { tag?: ExpressionTag | "" }) =>
			read(expression.$patch({ param, json: patch })),
		onSuccess: onChange,
	});
	const remove = useMutation({
		mutationFn: () => read(expression.$delete({ param })),
		onSuccess: onChange,
	});
	const cutout = useMutation({
		mutationFn: () => read(expression.cutout.$post({ param })),
		onSuccess: onChange,
	});
	const restore = useMutation({
		mutationFn: () => read(expression.cutout.$delete({ param })),
		onSuccess: onChange,
	});
	const tag = useMutation({
		mutationFn: () => read(expression.tag.$post({ param })),
		onSuccess: onTagged,
	});
	const regenerate = useMutation({
		mutationFn: () => read(expression.regenerate.$post({ param })),
		onSuccess: onChange,
	});
	const makeNeutral = useMutation({
		mutationFn: () => read(expression.neutral.$put({ param })),
		onSuccess: onChange,
	});
	return { update, remove, cutout, restore, tag, regenerate, makeNeutral };
}

/** The neutral face (the character's picture) and the reference image faces are drawn from. */
export function useNeutralActions(characterId: string, onChange: (c: CharacterView) => void) {
	const character = client.characters[":id"];
	const param = { id: characterId };
	const upload = useMutation({
		mutationFn: (file: File) =>
			api.put<CharacterView>(`/api/characters/${characterId}/avatar`, fileForm(file)),
		onSuccess: onChange,
	});
	const generate = useMutation({
		mutationFn: (request: NeutralGenerate) =>
			read(character.avatar.generate.$post({ param, json: request })),
		onSuccess: onChange,
	});
	const unset = useMutation({
		mutationFn: () => read(character.avatar.$delete({ param })),
		onSuccess: onChange,
	});
	const setReference = useMutation({
		mutationFn: (file: File) =>
			api.put<CharacterView>(`/api/characters/${characterId}/reference`, fileForm(file)),
		onSuccess: onChange,
	});
	return { upload, generate, unset, setReference };
}

const batchRunning = (b: ExpressionBatchView | null | undefined) => !!b && isJobActive(b.status);

/** The faces being generated on the server: started from here, followed while it runs, and
 *  each new face loaded as soon as it is added. */
function useExpressionBatch(characterId: string) {
	const qc = useQueryClient();
	const batch = client.characters[":id"].expressions.batch;
	const param = { id: characterId };
	const key = qk.expressionBatch(characterId);
	const characterSaved = useCharacterSaved(characterId);
	const state = useQuery({
		queryKey: key,
		queryFn: ({ signal }): Promise<ExpressionBatchView | null> =>
			read(batch.$get({ param }, signalled(signal))),
		refetchInterval: (q) => (batchRunning(q.state.data) ? POLL.expressionBatch : false),
	});
	const data = state.data ?? null;
	const start = useMutation({
		mutationFn: (request: ExpressionBatch) => read(batch.$post({ param, json: request })),
		onSuccess: (view) => qc.setQueryData(key, view),
	});
	const cancel = useMutation({
		mutationFn: () => read(batch.cancel.$post({ param })),
		onSuccess: (view) => qc.setQueryData(key, view),
	});
	// Faces added since this screen last looked; the first look only notes where the batch is.
	const seen = useRef<string | null>(null);
	const progress = data && `${data.id}:${data.done}:${data.status}`;
	useEffect(() => {
		if (!progress || progress === seen.current) return;
		const first = seen.current === null;
		seen.current = progress;
		if (!first) characterSaved();
	}, [progress, characterSaved]);
	const [dismissed, setDismissed] = useState<string | null>(null);

	return {
		data,
		running: batchRunning(data) || start.isPending,
		start,
		cancel,
		/** Why the latest batch stopped, until it is dismissed. */
		error: data?.error && data.id !== dismissed ? data.error : null,
		dismiss: () => setDismissed(data?.id ?? null),
	};
}
