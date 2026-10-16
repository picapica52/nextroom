import { cn } from "@nextroom/ui/lib/utils";
import { Check, Copy } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { COPIED_FEEDBACK_MS } from "@/lib/constants";

function ActionButton({
	done = false,
	label,
	onClick,
	children,
}: {
	done?: boolean;
	label: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			onClick={onClick}
			className={cn(
				"inline-flex h-7 min-w-7 shrink-0 items-center justify-center gap-1.5 rounded-full border-2 bg-card px-2 text-[11.5px] font-bold text-muted-foreground transition-[opacity,background-color,border-color,color] duration-150 hover:border-pastel-lilac-edge hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-fine:opacity-55 pointer-fine:group-hover/msg:opacity-100 [&_svg]:size-3.5 [&_svg]:shrink-0",
				done && "border-pastel-mint-edge bg-pastel-mint text-foreground pointer-fine:opacity-100",
			)}
		>
			{children}
		</button>
	);
}

export function CopyButton({ text, labelled = false }: { text: string; labelled?: boolean }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);
	return (
		<ActionButton
			done={copied}
			label={copied ? "コピーしました" : "コピー"}
			onClick={async () => {
				await copyText(text);
				setCopied(true);
				clearTimeout(timer.current);
				timer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
			}}
		>
			{copied ? <Check strokeWidth={2.6} /> : <Copy />}
			{labelled && (copied ? "コピーしました" : "コピー")}
		</ActionButton>
	);
}

/** The clipboard API is missing when the app is opened over plain http from another device. */
async function copyText(text: string) {
	try {
		await navigator.clipboard.writeText(text);
		return;
	} catch {}
	const el = document.createElement("textarea");
	el.value = text;
	el.setAttribute("readonly", "");
	el.style.position = "fixed";
	el.style.opacity = "0";
	document.body.append(el);
	el.select();
	el.setSelectionRange(0, text.length);
	document.execCommand("copy");
	el.remove();
}
