import { Button } from "@nextroom/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@nextroom/ui/components/empty";
import { Plus, UserRound } from "lucide-react";
import { ErrorNote } from "@/components/status";
import { useCreateCharacter } from "@/features/characters/queries";

/** No character yet: each character made gets its conversation here. */
export function ChatEmptyState() {
	const create = useCreateCharacter();
	return (
		<Empty className="py-16">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<UserRound />
				</EmptyMedia>
				<EmptyTitle>まだ話し相手がいません</EmptyTitle>
				<EmptyDescription>
					キャラクターを作ると、その子との会話がここに1つできます。
				</EmptyDescription>
			</EmptyHeader>
			<EmptyContent>
				<Button disabled={create.isPending} onClick={() => create.mutate()}>
					<Plus />
					キャラクターを作る
				</Button>
				<ErrorNote error={create.error} />
			</EmptyContent>
		</Empty>
	);
}
