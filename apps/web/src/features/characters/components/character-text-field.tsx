import { Field, FieldDescription, FieldLabel } from "@nextroom/ui/components/field";
import { Textarea } from "@nextroom/ui/components/textarea";
import type { ReactNode } from "react";

/** A long field of the character's settings. */
export function TextField({
	id,
	label,
	rows,
	placeholder,
	description,
	action,
	value,
	onChange,
}: {
	id: string;
	label: string;
	rows: number;
	placeholder?: string;
	description?: string;
	action?: ReactNode;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<Field>
			<div className="flex items-center justify-between gap-2">
				<FieldLabel htmlFor={id}>{label}</FieldLabel>
				{action}
			</div>
			<Textarea
				id={id}
				rows={rows}
				className="resize-y text-sm leading-relaxed"
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
			/>
			{description && <FieldDescription className="text-xs">{description}</FieldDescription>}
		</Field>
	);
}
