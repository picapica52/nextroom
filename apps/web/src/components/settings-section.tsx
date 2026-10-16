import { Button } from "@nextroom/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@nextroom/ui/components/card";
import { cn } from "@nextroom/ui/lib/utils";
import { Save } from "lucide-react";
import type { ReactNode } from "react";
import { UnsavedGuard } from "@/components/save-field";
import { ErrorNote } from "@/components/status";

/** The scrolling part of the settings pane, below its header, where the sections sit as cards. */
export function SettingsBody({ children }: { children: ReactNode }) {
	return (
		<div className="min-h-0 flex-1 overflow-y-auto bg-muted">
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5 sm:px-5">
				<UnsavedGuard>{children}</UnsavedGuard>
			</div>
		</div>
	);
}

/** A group of settings, as one card in the settings pane. */
export function SettingsSection({
	title,
	description,
	action,
	className,
	children,
}: {
	title?: string;
	description?: ReactNode;
	/** Shown at the right of the title, such as a status badge. */
	action?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	return (
		<Card className="shrink-0">
			{title && (
				<CardHeader>
					<CardTitle>{title}</CardTitle>
					{description && <CardDescription className="text-xs">{description}</CardDescription>}
					{action && <CardAction>{action}</CardAction>}
				</CardHeader>
			)}
			<CardContent className={cn("flex flex-col gap-4", className)}>{children}</CardContent>
		</Card>
	);
}

/** Save and revert, fixed along the bottom of the settings pane. */
function SettingsFooter({ children }: { children: ReactNode }) {
	return (
		<footer className="flex shrink-0 flex-col gap-2 border-t-2 px-4 py-2.5">{children}</footer>
	);
}

/** A save that failed, along the bottom of the settings pane. */
export function SettingsErrorFooter({ error }: { error: unknown }) {
	if (!error) return null;
	return (
		<SettingsFooter>
			<ErrorNote error={error} />
		</SettingsFooter>
	);
}

/** The settings footer with revert and save, noting unsaved changes. */
export function SettingsSaveFooter({
	dirty,
	pending,
	error,
	onRevert,
	onSave,
}: {
	dirty: boolean;
	pending: boolean;
	error: unknown;
	onRevert: () => void;
	onSave: () => void;
}) {
	return (
		<SettingsFooter>
			<div className="flex items-center justify-end gap-2">
				{dirty && <span className="mr-auto text-xs text-warning">未保存の変更があります</span>}
				<Button variant="ghost" size="sm" disabled={!dirty} onClick={onRevert}>
					元に戻す
				</Button>
				<Button size="sm" disabled={!dirty || pending} onClick={onSave}>
					<Save />
					保存
				</Button>
			</div>
			<ErrorNote error={error} />
		</SettingsFooter>
	);
}
