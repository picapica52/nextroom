import { Field, FieldDescription, FieldLabel } from "@nextroom/ui/components/field";
import { Slider } from "@nextroom/ui/components/slider";
import { Textarea } from "@nextroom/ui/components/textarea";
import { useState } from "react";

/** A value being edited, apart from the saved `value` until it is let go. */
function useEditing<T>(value: T) {
	const [editing, setEditing] = useState<{ base: T; value: T } | null>(null);
	// A newer saved value wins over an edit begun before it.
	const current = editing && editing.base === value ? editing.value : value;
	return {
		current,
		edit: (next: T) => setEditing({ base: value, value: next }),
		done: () => setEditing(null),
	};
}

/** How fast the voice speaks; `onChange` once the thumb is let go. */
export function SpeedField({
	value,
	onChange,
	min = 0.5,
	max = 2,
}: {
	value: number;
	onChange: (speed: number) => void;
	min?: number;
	max?: number;
}) {
	const speed = useEditing(value);
	const shown = Math.min(Math.max(speed.current, min), max);
	return (
		<Field>
			<div className="flex items-center justify-between">
				<FieldLabel htmlFor="speed">話す速度</FieldLabel>
				<span className="font-mono text-sm font-medium">{shown.toFixed(2)}x</span>
			</div>
			<Slider
				id="speed"
				aria-label="話す速度"
				min={min}
				max={max}
				step={0.05}
				value={[shown]}
				onValueChange={(v) => speed.edit(Array.isArray(v) ? (v[0] ?? value) : v)}
				onValueCommitted={(v) => {
					const next = Array.isArray(v) ? (v[0] ?? value) : v;
					speed.done();
					if (next !== value) onChange(next);
				}}
			/>
			<div className="flex justify-between font-mono text-[11px] text-muted-foreground">
				<span>{min.toFixed(1)}x</span>
				<span>1.0x</span>
				<span>{max.toFixed(1)}x</span>
			</div>
		</Field>
	);
}

/** The caption: the way of speaking. `onChange` when the field is left. */
export function CaptionField({
	value,
	onChange,
}: {
	value: string;
	onChange: (caption: string) => void;
}) {
	const caption = useEditing(value);
	return (
		<Field>
			<FieldLabel htmlFor="cap">キャプション（任意）</FieldLabel>
			<Textarea
				id="cap"
				rows={3}
				className="resize-y leading-relaxed"
				value={caption.current}
				placeholder="例: 親しい相手に、楽しそうに少し早口で話している。"
				onChange={(e) => caption.edit(e.target.value)}
				onBlur={() => {
					caption.done();
					if (caption.current !== value) onChange(caption.current);
				}}
			/>
			<FieldDescription className="text-xs">
				声はボイスファイルで決まり、キャプションは話し方・感情の調整に効きます。
			</FieldDescription>
		</Field>
	);
}
