import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@nextroom/ui/components/select";
import { cn } from "@nextroom/ui/lib/utils";
import type { ReactNode } from "react";

/** A shadcn select over a flat option list; an option whose value is null clears the selection. */
export function SimpleSelect<T extends string>({
	id,
	value,
	onChange,
	options,
	placeholder,
	disabled,
	className,
}: {
	id?: string;
	value: T | null;
	onChange: (value: T | null) => void;
	options: { value: T | null; label: ReactNode }[];
	placeholder?: string;
	disabled?: boolean;
	className?: string;
}) {
	return (
		<Select<T | null>
			value={value}
			onValueChange={(v) => onChange(v)}
			items={options}
			disabled={disabled}
		>
			<SelectTrigger id={id} className={cn("w-full", className)}>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent className="w-auto min-w-(--anchor-width)">
				{options.map((o) => (
					<SelectItem key={o.value ?? "__none"} value={o.value}>
						{o.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
