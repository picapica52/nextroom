import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "cn";

function Switch({
	className,
	size = "default",
	...props
}: SwitchPrimitive.Root.Props & {
	size?: "sm" | "default";
}) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			data-size={size}
			className={cn(
				"peer group/switch relative inline-flex shrink-0 items-center rounded-full border-2 border-input transition-[background-color,box-shadow] duration-180 ease-smooth outline-none group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-6 data-[size=default]:w-14 data-[size=sm]:h-5 data-[size=sm]:w-11 data-checked:bg-pastel-lilac data-unchecked:bg-background data-disabled:cursor-not-allowed data-disabled:opacity-50",
				className,
			)}
			{...props}
		>
			<span
				aria-hidden="true"
				className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-[9.5px] leading-none font-extrabold tracking-wide select-none group-data-[size=sm]/switch:text-[8px] group-data-checked/switch:left-2 group-data-checked/switch:text-foreground group-data-unchecked/switch:right-1.5 group-data-unchecked/switch:text-muted-foreground group-data-[size=sm]/switch:group-data-checked/switch:left-1.5 group-data-[size=sm]/switch:group-data-unchecked/switch:right-1"
			>
				<span className="group-data-unchecked/switch:hidden">ON</span>
				<span className="group-data-checked/switch:hidden">OFF</span>
			</span>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className="pointer-events-none block rounded-full border-2 border-border-strong transition-[translate,background-color] duration-260 ease-spring group-data-[size=default]/switch:size-5 group-data-[size=sm]/switch:size-4 data-checked:bg-pastel-yellow data-unchecked:bg-muted group-data-[size=default]/switch:data-checked:translate-x-8 group-data-[size=sm]/switch:data-checked:translate-x-6 data-unchecked:translate-x-0"
			/>
		</SwitchPrimitive.Root>
	);
}

export { Switch };
