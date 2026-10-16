import { useRef } from "react";

/** A hidden file input: `open()` shows the file dialog, `input` is the element to render.
 *  `directory` picks a whole folder (each file's path is its webkitRelativePath). */
export function useFilePicker(
	onPick: (files: File[]) => void,
	{
		accept,
		multiple,
		directory,
	}: { accept?: string; multiple?: boolean; directory?: boolean } = {},
) {
	const ref = useRef<HTMLInputElement | null>(null);
	const input = (
		<input
			ref={(el) => {
				ref.current = el;
				if (directory) el?.setAttribute("webkitdirectory", "");
			}}
			type="file"
			accept={accept}
			multiple={multiple || directory}
			className="hidden"
			onChange={(e) => {
				const files = Array.from(e.target.files ?? []);
				e.target.value = "";
				onPick(files);
			}}
		/>
	);
	return { open: () => ref.current?.click(), input };
}
