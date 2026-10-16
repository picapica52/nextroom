import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const badgeVariants = cva(
	"group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border-[1.5px] border-border-strong px-2 py-0.5 text-xs font-bold whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
	{
		variants: {
			variant: {
				default: "border-pastel-yellow-edge bg-pastel-yellow text-foreground [a]:hover:bg-selected",
				secondary:
					"border-pastel-lilac-edge bg-pastel-lilac text-foreground [a]:hover:bg-secondary",
				destructive:
					"border-destructive/40 bg-background text-destructive focus-visible:ring-destructive/20 [a]:hover:bg-destructive/20",
				outline: "bg-background text-foreground [a]:hover:bg-hover [a]:hover:text-foreground",
				ghost: "border-transparent hover:bg-hover hover:text-foreground",
				link: "border-transparent font-bold text-primary hover:text-primary-hover",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

function Badge({
	className,
	variant = "default",
	render,
	...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return useRender({
		defaultTagName: "span",
		props: mergeProps<"span">(
			{
				className: cn(badgeVariants({ variant }), className),
			},
			props,
		),
		render,
		state: {
			slot: "badge",
			variant,
		},
	});
}

export { Badge, badgeVariants };
