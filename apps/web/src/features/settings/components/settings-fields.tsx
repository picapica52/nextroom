import { Button } from "@nextroom/ui/components/button";
import { Switch } from "@nextroom/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@nextroom/ui/components/toggle-group";
import { type ReactNode, useState } from "react";
import { SaveInput } from "@/components/save-field";
import { Dot } from "@/components/status";
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

/** A token kept on the server: never shown, only pasted, replaced or removed. */
export function SecretField({
	id,
	label,
	isSet,
	placeholder = "貼り付け",
	onSave,
	onDelete,
}: {
	id: string;
	label: string;
	isSet: boolean;
	placeholder?: string;
	onSave: (value: string) => Promise<boolean>;
	onDelete: () => void;
}) {
	const [replacing, setReplacing] = useState(false);
	if (isSet && !replacing)
		return (
			<SettingsRow
				label={label}
				control={
					<>
						<Dot tone="success">保存済み</Dot>
						<Button variant="outline" size="sm" onClick={() => setReplacing(true)}>
							変更
						</Button>
						<Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onDelete}>
							削除
						</Button>
					</>
				}
			/>
		);
	return (
		<SettingsRow
			label={label}
			htmlFor={id}
			control={
				<div className="flex w-72 max-w-full items-center gap-2">
					<SaveInput
						id={id}
						type="password"
						autoComplete="off"
						className="font-mono"
						autoFocus={replacing}
						value=""
						placeholder={placeholder}
						onSave={async (value) => {
							if (!value.trim()) return false;
							const ok = await onSave(value.trim());
							if (ok) setReplacing(false);
							return ok;
						}}
					/>
					{replacing && (
						<Button variant="ghost" size="sm" onClick={() => setReplacing(false)}>
							やめる
						</Button>
					)}
				</div>
			}
		/>
	);
}
