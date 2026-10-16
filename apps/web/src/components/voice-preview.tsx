import type { CharacterVoice } from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Spinner } from "@nextroom/ui/components/spinner";
import { Textarea } from "@nextroom/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { AudioLines } from "lucide-react";
import { useEffect, useState } from "react";
import { AudioPlayer } from "@/components/audio-player";
import { ErrorNote } from "@/components/status";
import { client, formatClock, respond } from "@/lib/api";

interface Spoken {
	url: string;
	duration: number;
	seed: number | null;
}

/**
 * Speaks one sentence with the character's voice settings and its voice files, on the model
 * they choose. The audio is kept nowhere.
 */
export function VoicePreview({
	characterId,
	settings,
	initialText,
}: {
	characterId: string;
	settings: CharacterVoice;
	initialText: string;
}) {
	const [text, setText] = useState(initialText);
	const [spoken, setSpoken] = useState<Spoken | null>(null);
	const speak = useMutation({
		mutationFn: async (): Promise<Spoken> => {
			const res = await respond(
				client.characters[":id"].voice.preview.$post({
					param: { id: characterId },
					json: { text: text.trim(), voice: settings },
				}),
			);
			const seed = res.headers.get("x-seed");
			return {
				url: URL.createObjectURL(await res.blob()),
				duration: Number(res.headers.get("x-duration") ?? 0),
				seed: seed ? Number(seed) : null,
			};
		},
		onSuccess: setSpoken,
	});
	useEffect(() => () => void (spoken && URL.revokeObjectURL(spoken.url)), [spoken]);
	const busy = speak.isPending;

	return (
		<div className="flex flex-col gap-3">
			<Textarea
				aria-label="試聴する文"
				rows={3}
				value={text}
				onChange={(e) => setText(e.target.value)}
				className="resize-y text-sm leading-relaxed"
			/>
			<div className="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={!text.trim() || busy}
					onClick={() => speak.mutate()}
				>
					{busy ? <Spinner /> : <AudioLines />}
					{busy ? "生成中…" : "この設定で生成"}
				</Button>
				{spoken && !busy && (
					<span className="font-mono text-xs text-muted-foreground">
						{formatClock(spoken.duration)}
						{spoken.seed != null && ` ・ seed ${spoken.seed}`}
					</span>
				)}
			</div>
			{spoken && <AudioPlayer key={spoken.url} autoPlay src={spoken.url} />}
			<ErrorNote error={speak.error} />
			<p className="m-0 text-xs text-muted-foreground">上の設定で試せます。</p>
		</div>
	);
}
