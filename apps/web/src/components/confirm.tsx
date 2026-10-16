import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@nextroom/ui/components/alert-dialog";
import { createContext, type ReactNode, use, useCallback, useRef, useState } from "react";

interface ConfirmOptions {
	title: string;
	description?: ReactNode;
	action?: string;
	destructive?: boolean;
}

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(
	async () => false,
);

/** `await confirm({...})` resolves true when the user accepts; replaces window.confirm. */
export function useConfirm() {
	return use(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
	const [options, setOptions] = useState<ConfirmOptions | null>(null);
	const [open, setOpen] = useState(false);
	const resolver = useRef<((ok: boolean) => void) | null>(null);

	const confirm = useCallback((next: ConfirmOptions) => {
		resolver.current?.(false);
		setOptions(next);
		setOpen(true);
		return new Promise<boolean>((resolve) => {
			resolver.current = resolve;
		});
	}, []);

	const settle = (ok: boolean) => {
		resolver.current?.(ok);
		resolver.current = null;
		setOpen(false);
	};

	return (
		<ConfirmContext value={confirm}>
			{children}
			<AlertDialog open={open} onOpenChange={(next) => !next && settle(false)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{options?.title}</AlertDialogTitle>
						{options?.description && (
							<AlertDialogDescription>{options.description}</AlertDialogDescription>
						)}
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>キャンセル</AlertDialogCancel>
						<AlertDialogAction
							variant={options?.destructive ? "destructive" : "default"}
							onClick={() => settle(true)}
						>
							{options?.action ?? "OK"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</ConfirmContext>
	);
}
