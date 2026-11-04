import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { cn } from "cn";

function Drawer(props: DrawerPrimitive.Root.Props) {
	return <DrawerPrimitive.Root data-slot="drawer" swipeDirection="down" {...props} />;
}

/** A panel that slides up from the bottom and is swiped down to close; for narrow screens. */
function DrawerContent({ className, children, ...props }: DrawerPrimitive.Popup.Props) {
	return (
		<DrawerPrimitive.Portal>
			<DrawerPrimitive.Backdrop
				data-slot="drawer-overlay"
				className="fixed inset-0 z-50 bg-foreground/20 opacity-[calc(1-var(--drawer-swipe-progress,0))] transition-opacity duration-280 ease-smooth data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0"
			/>
			<DrawerPrimitive.Viewport className="fixed inset-0 z-50">
				<DrawerPrimitive.Popup
					data-slot="drawer-content"
					className={cn(
						"fixed flex flex-col bg-popover text-sm text-popover-foreground shadow-float outline-none transition-transform duration-[calc(var(--drawer-swipe-strength,1)*320ms)] ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:select-none data-swiping:duration-0",
						"inset-x-0 bottom-0 max-h-[calc(100dvh-env(safe-area-inset-top)-1.5rem)] rounded-t-2xl border-t-2 pb-[env(safe-area-inset-bottom)] transform-[translateY(var(--drawer-swipe-movement-y,0px))] data-starting-style:transform-[translateY(100%)] data-ending-style:transform-[translateY(100%)]",
						className,
					)}
					{...props}
				>
					<div
						className="mx-auto mt-2 mb-1 h-1.25 w-10 shrink-0 rounded-full bg-border-strong"
						aria-hidden="true"
					/>
					{children}
				</DrawerPrimitive.Popup>
			</DrawerPrimitive.Viewport>
		</DrawerPrimitive.Portal>
	);
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
	return (
		<DrawerPrimitive.Title
			data-slot="drawer-title"
			className={cn("font-heading text-base font-medium text-foreground", className)}
			{...props}
		/>
	);
}

export { Drawer, DrawerContent, DrawerTitle };
