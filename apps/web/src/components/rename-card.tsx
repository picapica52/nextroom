import { Button } from "@nextroom/ui/components/button";
import { Card, CardContent } from "@nextroom/ui/components/card";
import { Field, FieldLabel } from "@nextroom/ui/components/field";
import { Input } from "@nextroom/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorNote } from "@/components/status";

/** An inline form to rename an item; `onSaved` runs after the save, before `onDone`. */
export function RenameCard({
	id,
	label,
	initial,
	onSave,
	onSaved,
	onDone,
}: {
	id: string;
	label: string;
	initial: string;
	onSave: (name: string) => Promise<unknown>;
	onSaved: () => Promise<unknown>;
	onDone: () => void;
}) {
	const [name, setName] = useState(initial);
	const save = useMutation({
		mutationFn: () => onSave(name),
		onSuccess: async () => {
			await onSaved();
			onDone();
		},
	});
	return (
		<Card size="sm">
			<CardContent className="flex flex-wrap items-end gap-3">
				<Field className="flex-[1_1_240px]">
					<FieldLabel htmlFor={id}>{label}</FieldLabel>
					<Input id={id} value={name} onChange={(e) => setName(e.target.value)} />
				</Field>
				<Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
					保存
				</Button>
				<Button variant="ghost" onClick={onDone}>
					キャンセル
				</Button>
				{save.error != null && (
					<div className="basis-full">
						<ErrorNote error={save.error} />
					</div>
				)}
			</CardContent>
		</Card>
	);
}
