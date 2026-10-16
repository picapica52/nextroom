import type { ChatMessage } from "@nextroom/contracts";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@nextroom/ui/components/dialog";
import { ScrollArea } from "@nextroom/ui/components/scroll-area";
import { BrowserPanel } from "@/features/agent/components/browser-panel";
import { allSteps } from "../conversation";

/** The conversation's browser, where the agent's work can be watched and taken over. */
export function BrowserDialog({
	open,
	onOpenChange,
	sessionId,
	messages,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sessionId: string;
	messages: ChatMessage[];
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex h-[min(90svh,960px)] w-[min(1200px,calc(100vw-2rem))] max-w-none flex-col gap-0 p-0 sm:max-w-none">
				<DialogHeader className="border-b-2 py-3 pr-12 pl-4">
					<DialogTitle>ブラウザ</DialogTitle>
					<DialogDescription className="sr-only">
						キャラクターが操作中のブラウザを表示し、操作を引き継げます
					</DialogDescription>
				</DialogHeader>
				<ScrollArea className="min-h-0 flex-1">
					<div className="p-4 sm:p-6">
						<BrowserPanel sessionId={sessionId} steps={allSteps(messages)} />
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
