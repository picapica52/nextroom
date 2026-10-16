const BARS = [
	["#D94A3D", 10],
	["#E8913A", 16],
	["#D9B530", 22],
	["#3E9B5F", 14],
	["#3346D3", 19],
	["#7C4DCC", 12],
] as const;

export function Logo() {
	return (
		<div className="flex h-8 min-w-0 items-center gap-2.5 px-1.5">
			<div className="flex h-[22px] shrink-0 items-end gap-0.5" aria-hidden="true">
				{BARS.map(([color, h]) => (
					<span
						key={color}
						className="w-1 rounded-sm outline-[1.5px] outline-foreground"
						style={{ height: h, background: color }}
					/>
				))}
			</div>
			<div className="truncate text-base font-extrabold tracking-tight">Nextroom</div>
		</div>
	);
}
