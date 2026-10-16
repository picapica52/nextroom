import { Field, FieldDescription, FieldLabel } from "@nextroom/ui/components/field";
import { Label } from "@nextroom/ui/components/label";
import { Switch } from "@nextroom/ui/components/switch";
import type { ReactNode } from "react";
import { SaveInput } from "@/components/save-field";

export function SwitchRow({
	id,
	label,
	description,
	checked,
	onChange,
}: {
	id: string;
	label: string;
	description?: ReactNode;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<div className="flex items-start gap-3">
			<Switch id={id} className="mt-0.5" checked={checked} onCheckedChange={onChange} />
			<div className="flex flex-col gap-0.5">
				<Label htmlFor={id}>{label}</Label>
				{description && <p className="m-0 text-xs text-muted-foreground">{description}</p>}
			</div>
		</div>
	);
}

type NumberFieldProps = {
	id: string;
	label: string;
	description?: string;
	min?: number;
	max?: number;
	step?: number;
	placeholder?: string;
} & (
	| { value: number; onChange: (value: number) => unknown; nullable?: false }
	| { value: number | null; onChange: (value: number | null) => unknown; nullable: true }
);

/** `nullable`: a whole number that may be left blank (null). A description gets a full-size label. */
export function NumberField({
	id,
	label,
	description,
	value,
	onChange,
	nullable,
	...props
}: NumberFieldProps) {
	return (
		<Field>
			<FieldLabel
				htmlFor={id}
				className={description ? undefined : "text-xs text-muted-foreground"}
			>
				{label}
			</FieldLabel>
			<SaveInput
				id={id}
				type="number"
				className="font-mono"
				value={value === null ? "" : String(value)}
				onSave={(text) => {
					if (text !== "") return onChange(nullable ? Math.trunc(Number(text)) : Number(text));
					if (nullable) return onChange(null);
					return false;
				}}
				{...props}
			/>
			{description && <FieldDescription className="text-xs">{description}</FieldDescription>}
		</Field>
	);
}
