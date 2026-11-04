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
		<Field className="@container">
			<FieldLabel>{label}</FieldLabel>
			<ToggleGroup
				aria-label={label}
				variant="outline"
				spacing={1}
				className={cn(
					"grid w-full",
					providers.length > 4
						? "grid-cols-2 @xl:grid-cols-4"
						: providers.length > 2
							? "grid-cols-1 @md:grid-cols-3"
							: "grid-cols-2",
				)}
				value={[value]}
				onValueChange={(next) => next[0] && onChange(next[0] as P)}
			>
				{providers.map((p) => (
					<ToggleGroupItem
						key={p}
						value={p}
						className="h-auto min-h-8 w-full min-w-0 py-1 text-center whitespace-normal"
					>
						{labels[p]}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</Field>
	);
}
