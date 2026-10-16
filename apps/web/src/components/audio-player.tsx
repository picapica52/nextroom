import { Button } from "@nextroom/ui/components/button";
import { cn } from "@nextroom/ui/lib/utils";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { decodeAudio } from "@/lib/audio-upload";

const BARS = 96;

const clock = (sec: number) =>
	`${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** The loudest sample in each slice of the audio, scaled to 0–1; null until decoded or if decoding fails. */
function usePeaks(src: string) {
	const [peaks, setPeaks] = useState<number[] | null>(null);
	useEffect(() => {
		const abort = new AbortController();
		setPeaks(null);
		fetch(src, { signal: abort.signal })
			.then((r) => r.arrayBuffer())
			.then(decodeAudio)
			.then((audio) => {
				const data = audio.getChannelData(0);
				const step = Math.max(1, Math.floor(data.length / BARS));
				const out: number[] = [];
				for (let i = 0; i < BARS; i++) {
					let max = 0;
					for (const v of data.subarray(i * step, (i + 1) * step)) max = Math.max(max, Math.abs(v));
					out.push(max);
				}
				const top = Math.max(...out) || 1;
				if (!abort.signal.aborted) setPeaks(out.map((v) => v / top));
			})
			.catch(() => {});
		return () => abort.abort();
	}, [src]);
	return peaks;
}

/** Play button, waveform (a plain bar until it is decoded) and time; the waveform seeks. */
export function AudioPlayer({ src, autoPlay }: { src: string; autoPlay?: boolean }) {
	const audio = useRef<HTMLAudioElement>(null);
	const [playing, setPlaying] = useState(false);
	const [time, setTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const peaks = usePeaks(src);
	const ratio = duration ? Math.min(1, time / duration) : 0;

	return (
		<div className="flex min-w-0 items-center gap-3 rounded-full border-2 bg-muted py-1.5 pr-4 pl-1.5">
			{/* biome-ignore lint/a11y/useMediaCaption: generated speech has no captions */}
			<audio
				ref={audio}
				src={src}
				autoPlay={autoPlay}
				preload="metadata"
				onPlay={() => setPlaying(true)}
				onPause={() => setPlaying(false)}
				onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
				onLoadedMetadata={(e) => {
					const d = e.currentTarget.duration;
					setDuration(Number.isFinite(d) ? d : 0);
				}}
			/>
			<Button
				size="icon"
				className="size-9 rounded-full"
				aria-label={playing ? "一時停止" : "再生"}
				title={playing ? "一時停止" : "再生"}
				onClick={() => (playing ? audio.current?.pause() : audio.current?.play())}
			>
				{playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
			</Button>
			<div className="relative flex h-7 min-w-0 flex-1 items-center rounded-full has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50">
				{peaks ? (
					<div className="flex h-full w-full items-center gap-px" aria-hidden="true">
						{peaks.map((p, i) => (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed set of bars
								key={i}
								className={cn(
									"min-w-0 flex-1 rounded-full",
									(i + 0.5) / peaks.length <= ratio ? "bg-foreground" : "bg-foreground/20",
								)}
								style={{ height: `${Math.max(12, p * 100)}%` }}
							/>
						))}
					</div>
				) : (
					<div
						className="h-2.5 w-full overflow-hidden rounded-full border-[1.5px] bg-background"
						aria-hidden="true"
					>
						<div className="h-full bg-foreground" style={{ width: `${ratio * 100}%` }} />
					</div>
				)}
				<input
					type="range"
					min={0}
					max={duration || 0}
					step={0.01}
					value={time}
					aria-label="再生位置"
					onChange={(e) => {
						const t = Number(e.target.value);
						if (audio.current) audio.current.currentTime = t;
						setTime(t);
					}}
					className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
				/>
			</div>
			<span className="font-mono text-xs whitespace-nowrap tabular-nums">
				{clock(time)} / {clock(duration)}
			</span>
		</div>
	);
}
