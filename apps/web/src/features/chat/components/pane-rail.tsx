import { Button } from "@nextroom/ui/components/button";
import { Spinner } from "@nextroom/ui/components/spinner";
import { Toggle } from "@nextroom/ui/components/toggle";
import { cn } from "@nextroom/ui/lib/utils";
import { Upload } from "lucide-react";
import type { ReactNode } from "react";
import { useWorkspaceFileActions } from "@/features/workspaces/queries";
import { useFilePicker } from "@/hooks/use-file-picker";
import { pickedFiles } from "@/lib/audio-upload";

const RAIL_WIDTH = 40;

/**
 * A docked pane that narrows into its rail when closed. Both stay mounted so the width can animate;
 * the contents fade out before the pane shrinks and the rail fades in after.
 */
export function CollapsiblePane({
	open,
	width,
	rail,
	className,
	children,
}: {
	open: boolean;
	width: number;
	rail: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	return (
		<div
			className={cn(
				"relative shrink-0 overflow-hidden rounded-xl border-2 bg-card shadow-puff transition-[width] duration-280 ease-snap",
				className,
			)}
			style={{ width: open ? width : RAIL_WIDTH }}
		>
			<div
				inert={!open}
				className={cn(
					"absolute inset-y-0 left-0 transition-opacity ease-smooth",
					open ? "opacity-100 delay-100 duration-180" : "opacity-0 duration-100",
				)}
				style={{ width: width - 4 }}
			>
				{children}
			</div>
			<div
				inert={open}
				className={cn(
					"absolute inset-y-0 left-0 transition-opacity ease-smooth",
					open ? "opacity-0 duration-100" : "opacity-100 delay-150 duration-180",
				)}
				style={{ width: RAIL_WIDTH - 4 }}
			>
				{rail}
			</div>
		</div>
	);
}

/** A closed pane, kept as a narrow strip: a button to open it, its frequent actions and its name. */
export function PaneRail({
	label,
	open,
	onOpen,
	children,
	footer,
}: {
	label: string;
	/** The icon of the button that opens the pane. */
	open: ReactNode;
	onOpen: () => void;
	children?: ReactNode;
	/** Kept at the bottom of the rail. */
	footer?: ReactNode;
}) {
	return (
		<aside
			aria-label={label}
			className="flex h-full w-full flex-col items-center gap-1 overflow-hidden py-1.5"
		>
			<RailButton label={`${label}を開く`} onClick={onOpen}>
				{open}
			</RailButton>
			{children && (
				<>
					<div className="my-0.5 w-5 border-t-2" />
					{children}
				</>
			)}
			<button
				type="button"
				onClick={onOpen}
				className="mt-1.5 rounded-md px-1 py-2 text-xs font-bold tracking-widest text-muted-foreground transition-colors duration-120 ease-smooth [writing-mode:vertical-rl] hover:bg-hover hover:text-foreground active:bg-pressed focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
			>
				{label}
			</button>
			{footer && <div className="mt-auto pb-0.5">{footer}</div>}
		</aside>
	);
}

export function RailButton({
	label,
	onClick,
	disabled,
	className,
	children,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	className?: string;
	children: ReactNode;
}) {
	return (
		<Button
			variant="ghost"
			size="icon-sm"
			aria-label={label}
			title={label}
			disabled={disabled}
			className={cn("text-muted-foreground", className)}
			onClick={onClick}
		>
			{children}
		</Button>
	);
}

/** Uploads files to the top of the character's workspace without opening the file pane. */
export function RailUpload({ characterId }: { characterId: string | null }) {
	if (!characterId) {
		return (
			<RailButton
				label="ファイルをアップロード（会話を始めると使えます）"
				disabled
				onClick={() => {}}
			>
				<Upload />
			</RailButton>
		);
	}
	return <WorkspaceUpload key={characterId} characterId={characterId} />;
}

function WorkspaceUpload({ characterId }: { characterId: string }) {
	const { upload } = useWorkspaceFileActions(characterId);
	const picker = useFilePicker(
		(files) => {
			if (files.length) upload.mutate({ dir: "", files: pickedFiles(files) });
		},
		{ multiple: true },
	);
	const error = upload.error instanceof Error ? upload.error.message : null;
	return (
		<>
			<RailButton
				label={
					error
						? `アップロードに失敗しました: ${error}`
						: upload.isPending
							? `${upload.variables?.files.length} 件をアップロードしています…`
							: "ファイルをアップロード"
				}
				disabled={upload.isPending}
				className={cn(error && "text-destructive")}
				onClick={picker.open}
			>
				{upload.isPending ? <Spinner /> : <Upload />}
			</RailButton>
			{picker.input}
		</>
	);
}

/** Opens or closes a pane; highlighted while the pane is open. */
export function PaneToggle({
	label,
	pressed,
	onPressedChange,
	children,
}: {
	label: string;
	pressed: boolean;
	onPressedChange: (pressed: boolean) => void;
	children: ReactNode;
}) {
	return (
		<Toggle
			size="sm"
			pressed={pressed}
			onPressedChange={onPressedChange}
			aria-label={label}
			title={`${label}を${pressed ? "閉じる" : "開く"}`}
			className="px-0 text-muted-foreground"
		>
			{children}
		</Toggle>
	);
}
