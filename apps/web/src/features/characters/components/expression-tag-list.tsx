import { EXPRESSION_TAG_GROUPS, type ExpressionTag } from "@nextroom/contracts";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@nextroom/ui/components/command";

/** The fixed tags, searchable by Japanese label or English value. */
export function ExpressionTagList({
	checked,
	used,
	onSelect,
}: {
	checked: (tag: string) => boolean;
	/** Tags already on the character's faces. */
	used: Set<string>;
	onSelect: (tag: ExpressionTag) => void;
}) {
	return (
		<Command>
			<CommandInput placeholder="タグを検索（日本語・英語）" />
			<CommandList>
				<CommandEmpty>合うタグはありません</CommandEmpty>
				{EXPRESSION_TAG_GROUPS.map((group) => (
					<CommandGroup key={group.label} heading={group.label}>
						{group.tags.map((tag) => (
							<CommandItem
								key={tag.value}
								value={`${tag.label} ${tag.value}`}
								data-checked={checked(tag.value)}
								onSelect={() => onSelect(tag.value)}
							>
								<span className="min-w-0 flex-1 truncate">{tag.label}</span>
								{used.has(tag.value) && !checked(tag.value) && (
									<span className="inline-flex h-5 items-center rounded-full border-2 bg-pastel-mint px-1.5 text-[10px] font-extrabold">
										使用中
									</span>
								)}
								<span className="font-mono text-[11px] text-muted-foreground">{tag.value}</span>
							</CommandItem>
						))}
					</CommandGroup>
				))}
			</CommandList>
		</Command>
	);
}
