import { Field, FieldLabel } from "@nextroom/ui/components/field";
import { ToggleGroup, ToggleGroupItem } from "@nextroom/ui/components/toggle-group";
import { cn } from "@nextroom/ui/lib/utils";

/** Who does a job (this PC or a service), as a row of toggles. */
export function ProviderToggle<P extends string>({
	label,
	providers,
	labels,
	value,
	onChange,
}: {
	label: string;
	providers: readonly P[];
	labels: Record<P, string>;
	value: P;
	onChange: (provider: P) => void;
}) {
	return (
		<Field>
			<FieldLabel>{label}</FieldLabel>
			<ToggleGroup
				aria-label={label}
				variant="outline"
				spacing={1}
				className={cn("grid w-full", providers.length > 2 ? "sm:grid-cols-3" : "grid-cols-2")}
				value={[value]}
				onValueChange={(next) => next[0] && onChange(next[0] as P)}
			>
				{providers.map((p) => (
					<ToggleGroupItem key={p} value={p} className="w-full">
						{labels[p]}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</Field>
	);
}
