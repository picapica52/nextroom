import { Button } from "@nextroom/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@nextroom/ui/components/dropdown-menu";
import { Ellipsis } from "lucide-react";

/** "⋯" button with a small menu of secondary actions (e.g. delete). */
export function MoreMenu({
	items,
}: {
	items: { label: string; danger?: boolean; onClick: () => void }[];
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<Button variant="outline" size="icon" aria-label="その他の操作" />}
			>
				<Ellipsis />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-44">
				{items.map((item) => (
					<DropdownMenuItem
						key={item.label}
						variant={item.danger ? "destructive" : "default"}
						onClick={item.onClick}
					>
						{item.label}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
