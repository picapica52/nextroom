import type { ChatMessage } from "@nextroom/contracts";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@nextroom/ui/components/dialog";
import { ScrollArea } from "@nextroom/ui/components/scroll-area";
import { DesktopPanel } from "@/features/agent/components/desktop-panel";
import { allSteps } from "../conversation";

/** The character's desktop, where its work can be watched and taken over. */
export function DesktopDialog({
	open,
	onOpenChange,
	characterId,
	messages,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	characterId: string;
	messages: ChatMessage[];
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex h-[min(90svh,960px)] w-[min(1400px,calc(100vw-2rem))] max-w-none flex-col gap-0 p-0 sm:max-w-none">
				<DialogHeader className="border-b-2 py-3 pr-12 pl-4">
					<DialogTitle>デスクトップ</DialogTitle>
					<DialogDescription className="sr-only">
						キャラクターのデスクトップを表示し、操作を代われます
					</DialogDescription>
				</DialogHeader>
				<ScrollArea className="min-h-0 flex-1">
					<div className="p-4 sm:p-6">
						{open && <DesktopPanel characterId={characterId} steps={allSteps(messages)} />}
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
