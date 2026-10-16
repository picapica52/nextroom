import { Avatar, AvatarFallback, AvatarImage } from "@nextroom/ui/components/avatar";
import { cn } from "@nextroom/ui/lib/utils";
import { UserRound } from "lucide-react";
import { avatarUrl } from "@/lib/api";

/** Round character picture, or a person icon when the character has none. */
export function CharacterAvatar({
	character,
	className,
}: {
	character: { id: string; has_avatar: boolean; updated_at: number } | null | undefined;
	className?: string;
}) {
	const url = character ? avatarUrl(character) : null;
	return (
		<Avatar className={cn("size-9", className)}>
			{url && <AvatarImage src={url} alt="" />}
			<AvatarFallback>
				<UserRound className="size-1/2" />
			</AvatarFallback>
		</Avatar>
	);
}
