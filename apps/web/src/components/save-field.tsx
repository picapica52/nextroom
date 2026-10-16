import { Button } from "@nextroom/ui/components/button";
import { Input } from "@nextroom/ui/components/input";
import { Textarea } from "@nextroom/ui/components/textarea";
import { Check } from "lucide-react";
import {
	type ComponentProps,
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useId,
	useState,
} from "react";
import { useBlocker } from "react-router-dom";

/** Saves a field's text; resolving to false keeps the typed text (the save failed). */
type OnSave = (value: string) => unknown;

const UnsavedContext = createContext<((id: string, dirty: boolean) => void) | null>(null);

/** Asks before leaving the page while a field inside holds typed text that is not saved. */
export function UnsavedGuard({ children }: { children: ReactNode }) {
	const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set());
	const blocker = useBlocker(dirty.size > 0);
	useEffect(() => {
		if (blocker.state !== "blocked") return;
		if (window.confirm("保存していない変更があります。破棄して移動しますか？")) blocker.proceed();
		else blocker.reset();
	}, [blocker]);
	useEffect(() => {
		if (!dirty.size) return;
		const warn = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [dirty.size]);
	const mark = useCallback(
		(id: string, d: boolean) =>
			setDirty((prev) => {
				if (prev.has(id) === d) return prev;
				const next = new Set(prev);
				if (d) next.add(id);
				else next.delete(id);
				return next;
			}),
		[],
	);
	return <UnsavedContext.Provider value={mark}>{children}</UnsavedContext.Provider>;
}

/** Typed text, kept apart from the saved `value` until saved. */
function useDraft(value: string, onSave: OnSave) {
	const [draft, setDraft] = useState<string | null>(null);
	const dirty = draft !== null && draft !== value;
	const mark = useContext(UnsavedContext);
	const id = useId();
	useEffect(() => mark?.(id, dirty), [mark, id, dirty]);
	useEffect(() => () => mark?.(id, false), [mark, id]);
	return {
		value: draft ?? value,
		dirty,
		change: setDraft,
		save: async () => {
			if (draft === null || !dirty) return setDraft(null);
			if ((await onSave(draft)) !== false) setDraft(null);
		},
		revert: () => setDraft(null),
	};
}

function SaveButton({ onClick }: { onClick: () => void }) {
	return (
		<Button size="sm" onClick={onClick}>
			<Check />
			保存
		</Button>
	);
}

function RevertButton({ onClick }: { onClick: () => void }) {
	return (
		<Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onClick}>
			戻す
		</Button>
	);
}

type FieldProps<T extends "input" | "textarea"> = Omit<ComponentProps<T>, "value" | "onChange"> & {
	value: string;
	onSave: OnSave;
};

/** A text input saved with the button beside it (or Enter), shown once the text changes. */
export function SaveInput({ value, onSave, ...props }: FieldProps<"input">) {
	const d = useDraft(value, onSave);
	return (
		<div className="flex min-w-0 flex-1 items-center gap-2">
			<Input
				{...props}
				value={d.value}
				onChange={(e) => d.change(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && !e.nativeEvent.isComposing) d.save();
					else if (e.key === "Escape") d.revert();
				}}
			/>
			{d.dirty && (
				<>
					<SaveButton onClick={d.save} />
					<RevertButton onClick={d.revert} />
				</>
			)}
		</div>
	);
}

/** A textarea saved with the button below it (or Ctrl+Enter), shown once the text changes. */
export function SaveTextarea({ value, onSave, ...props }: FieldProps<"textarea">) {
	const d = useDraft(value, onSave);
	return (
		<>
			<Textarea
				{...props}
				value={d.value}
				onChange={(e) => d.change(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) d.save();
				}}
			/>
			{d.dirty && (
				<div className="flex items-center justify-end gap-2">
					<span className="mr-auto text-xs text-warning">未保存</span>
					<RevertButton onClick={d.revert} />
					<SaveButton onClick={d.save} />
				</div>
			)}
		</>
	);
}
