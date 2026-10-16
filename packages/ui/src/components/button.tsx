import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const buttonVariants = cva(
	"group/button inline-flex shrink-0 items-center justify-center rounded-lg border-2 border-transparent bg-clip-padding text-sm font-bold whitespace-nowrap transition-[translate,box-shadow,background-color,color] duration-120 ease-smooth outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default:
					"border-pastel-yellow-edge bg-pastel-yellow text-foreground shadow-[0_3px_0_0_var(--pastel-yellow-shadow)] hover:bg-[color-mix(in_oklch,var(--pastel-yellow),var(--foreground)_7%)] active:not-aria-[haspopup]:translate-y-[3px] active:not-aria-[haspopup]:shadow-none disabled:border-dashed disabled:border-border-strong disabled:bg-muted disabled:text-foreground/45 disabled:shadow-none",
				outline:
					"border-border bg-background shadow-puff hover:bg-muted hover:text-foreground active:not-aria-[haspopup]:translate-y-[3px] active:not-aria-[haspopup]:shadow-none aria-expanded:bg-selected aria-expanded:text-selected-foreground disabled:border-dashed disabled:border-border-strong disabled:bg-muted disabled:text-foreground/45 disabled:shadow-none",
				secondary:
					"border-pastel-lilac-edge bg-pastel-lilac text-foreground shadow-[0_3px_0_0_var(--pastel-lilac-shadow)] hover:bg-[color-mix(in_oklch,var(--pastel-lilac),var(--foreground)_7%)] active:not-aria-[haspopup]:translate-y-[3px] active:not-aria-[haspopup]:shadow-none aria-expanded:bg-pastel-lilac disabled:border-dashed disabled:border-border-strong disabled:bg-muted disabled:text-foreground/45 disabled:shadow-none",
				ghost:
					"hover:border-border hover:bg-background hover:text-foreground active:bg-pressed aria-expanded:border-pastel-yellow-edge aria-expanded:bg-selected aria-expanded:text-selected-foreground disabled:opacity-50",
				destructive:
					"border-destructive/40 bg-background text-destructive shadow-[0_3px_0_0_color-mix(in_oklch,var(--destructive)_25%,transparent)] hover:bg-destructive/8 focus-visible:ring-destructive/20 active:not-aria-[haspopup]:translate-y-[3px] active:not-aria-[haspopup]:shadow-none disabled:border-dashed disabled:border-border-strong disabled:bg-muted disabled:text-foreground/45 disabled:shadow-none",
				link: "font-bold text-primary hover:text-primary-hover disabled:opacity-50",
			},
			size: {
				default:
					"h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
				lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				icon: "size-8",
				"icon-xs":
					"size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
				"icon-sm":
					"size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
				"icon-lg": "size-9",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
	return (
		<ButtonPrimitive
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
