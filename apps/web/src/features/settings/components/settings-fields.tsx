import { Switch } from "@nextroom/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@nextroom/ui/components/toggle-group";
import type { ReactNode } from "react";
import { SaveInput } from "@/components/save-field";
import { SettingsRow } from "./settings-layout";

/** A setting turned on and off, its switch at the right. */
export function SwitchRow({
	id,
	label,
	description,
	checked,
	onChange,
	children,
}: {
	id: string;
	label: string;
	description?: ReactNode;
	checked: boolean;
	onChange: (checked: boolean) => void;
	/** Below the row, such as what is missing for it to work. */
	children?: ReactNode;
}) {
	return (
		<SettingsRow
			label={label}
			htmlFor={id}
			hint={description}
			control={<Switch id={id} checked={checked} onCheckedChange={onChange} />}
		>
			{children}
		</SettingsRow>
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

/** A number, typed at the right. `nullable`: a whole number that may be left blank (null). */
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
		<SettingsRow
			label={label}
			htmlFor={id}
			hint={description}
			control={
				<div className="flex justify-end">
					<SaveInput
						id={id}
						type="number"
						className="w-28 font-mono"
						value={value === null ? "" : String(value)}
						onSave={(text) => {
							if (text !== "") return onChange(nullable ? Math.trunc(Number(text)) : Number(text));
							if (nullable) return onChange(null);
							return false;
						}}
						{...props}
					/>
				</div>
			}
		/>
	);
}

/** A choice of a few options side by side, for the right of a row. */
export function Segmented<T extends string>({
	label,
	options,
	value,
	onChange,
}: {
	label: string;
	options: { value: T; label: string }[];
	value: T;
	onChange: (value: T) => void;
}) {
	return (
		<ToggleGroup
			aria-label={label}
			variant="outline"
			size="sm"
			spacing={0}
			value={[value]}
			onValueChange={(next) => next[0] && onChange(next[0] as T)}
		>
			{options.map((o) => (
				<ToggleGroupItem key={o.value} value={o.value}>
					{o.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
