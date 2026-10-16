import { type ChatMessage, replyModelOf } from "@nextroom/contracts";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCharacter } from "@/features/characters/queries";
import { useChatSettings } from "@/hooks/queries";
import { useWide } from "@/hooks/use-media-query";
import {
	characterDisplayName,
	micErrorText,
	openChoices,
	RevealStore,
	useSegmentQueue,
} from "../conversation";
import { useChatLayout } from "../use-chat-layout";
import { useCurrentChat } from "../use-current-chat";
import type { MicMode } from "../voice/mic-button";
import { MicLevel } from "../voice/mic-level";
import { usePushToTalk } from "../voice/push-to-talk";
import { useReplyVoice } from "../voice/use-reply-voice";
import { BrowserDialog } from "./browser-dialog";
import { CallCaptions, ReplyReveal } from "./call-captions";
import { CallStage } from "./call-stage";
import { ChatBottomBar } from "./chat-bottom-bar";
import { ChatEmptyState } from "./chat-empty-state";
import { ChatListPane } from "./chat-list-pane";
import { ChatPageHeader } from "./chat-page-header";
import { ChatSidePane } from "./chat-side-pane";
import { Transcript } from "./transcript";

const MIC_LABEL: Record<MicMode, string> = {
	idle: "押している間だけ話す（Space）",
	opening: "準備中",
	holding: "離すと送信",
	replying: "タップで返答を止める",
};

/** The tool calls shown on the face, newest last. */
const SHOWN_STEPS = 3;

const NO_LOG = <p className="m-0 text-center text-muted-foreground">まだやりとりはありません。</p>;

/** The conversation: the character's face with captions, the bar to talk from, and the log beside
 *  it. The microphone listens while it (or Space) is held down. */
export default function ChatPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const wide = useWide();
	const llm = useChatSettings();
	const layout = useChatLayout(wide);
	const [draft, setDraft] = useState("");
	const [images, setImages] = useState<File[]>([]);
	// The recording is being sent.
	const [sending, setSending] = useState(false);
	const [micLevel] = useState(() => new MicLevel());
	const [micError, setMicError] = useState<string | null>(null);
	const segments = useSegmentQueue();
	// The newest reply as written out with its voice, for both the captions and the log.
	const [reveal] = useState(() => new RevealStore());

	// ?view=browser opens the browser over the conversation.
	const browserOpen = searchParams.get("view") === "browser";
	const setBrowserOpen = (open: boolean) =>
		setSearchParams(open ? { view: "browser" } : {}, { replace: true });

	const chat = useCurrentChat({
		keepPolling: segments.playing,
		onSent: (turn) => reading.follow(llm.data?.tts_enabled ? turn.assistant.id : null),
		onSettled: () => setSending(false),
	});
	const { currentId, messages, activeTurn } = chat;
	const characterId = currentId;
	const reading = useReplyVoice({
		sessionId: currentId,
		session: chat.session,
		messages,
		segments,
	});
	const character = useCharacter(characterId, { enabled: !!characterId, retry: false });
	const name = characterDisplayName(character.data, characterId);
	const llmReady = !!llm.data && !!replyModelOf(llm.data);

	// Stops writing and synthesizing the reply, and its voice; what was written shows at once.
	const stopReply = () => {
		reading.stop();
		chat.cancelReply();
	};

	/** Sends typed (or chosen) words and any images, unless a turn is under way; false when
	 *  nothing was sent. `onSent`: the server took the turn. */
	const sendText = (text: string, attached: File[] = [], onSent?: () => void) => {
		if ((!text && !attached.length) || !chat.canSend) return false;
		reading.silence();
		chat.sendTurn({ text, images: attached }, onSent);
		return true;
	};

	const replying = !!activeTurn || segments.playing || reading.writing;
	// The reply is being prepared, synthesized, played or written out: the stop button stops it.
	const busy = sending || chat.sending || replying;
	const talk = usePushToTalk({
		disabled: !llmReady || busy,
		onPress: () => setMicError(null),
		onRecorded: (wav) => {
			setSending(true);
			chat.sendTurn({ audio: wav });
		},
		onLevel: micLevel.set,
		onError: (e) => setMicError(micErrorText(e, "文字で話しかけられます。")),
	});

	const micMode: MicMode = talk.state !== "idle" ? talk.state : busy ? "replying" : "idle";
	const { reply } = reading;
	const playing = reading.voice?.playing ?? null;
	const steps = (reply?.steps ?? []).filter((s) => !s.parent).slice(-SHOWN_STEPS);
	const speaking = segments.playing || activeTurn?.status === "speaking";
	const subtitle = talkedSince(messages);

	const log = (
		<Transcript
			sessionId={currentId}
			messages={messages}
			character={character.data ?? null}
			name={name}
			reveal={reveal}
			playing={playing}
			emptyState={NO_LOG}
		/>
	);

	return (
		<div className="flex h-full min-h-0 gap-3 p-3">
			<ChatListPane
				wide={wide}
				layout={layout}
				sessions={chat.sessions ?? []}
				currentId={currentId}
			/>

			<section
				aria-label="会話"
				className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border-2 bg-card shadow-puff"
			>
				<ChatPageHeader
					wide={wide}
					currentId={currentId}
					character={character.data}
					name={name}
					subtitle={subtitle}
					listOpen={layout.listOpen}
					onListOpen={layout.setListOpen}
					panelOpen={layout.filesOpen}
					onPanelOpen={layout.setFilesOpen}
					onBrowser={() => setBrowserOpen(true)}
				/>

				<div className="flex min-h-0 flex-1 flex-col px-3 pt-3 sm:px-3.5 sm:pt-3.5">
					{currentId && reply && (
						<ReplyReveal
							key={reply.id}
							reply={reply}
							voice={reading.voice}
							store={reveal}
							skipped={reading.skipped}
							onBusy={reading.setWriting}
						/>
					)}
					{currentId ? (
						<CallStage
							characterId={characterId}
							character={character.data}
							face={reading.face}
							speaking={speaking}
							steps={steps}
							onLog={layout.showLog}
						>
							{reply && (
								<CallCaptions
									reply={reply}
									store={reveal}
									playing={playing}
									hidden={!layout.captions || (!wide && layout.logOpen)}
								/>
							)}
						</CallStage>
					) : (
						<div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto rounded-[26px] border-2 bg-muted">
							{chat.noCharacters && <ChatEmptyState />}
						</div>
					)}
				</div>

				{!wide && currentId && (
					<>
						<button
							type="button"
							aria-expanded={layout.logOpen}
							onClick={() => layout.setLogOpen(!layout.logOpen)}
							className="mx-auto flex h-8 shrink-0 items-center gap-2 px-3 text-[11.5px] font-bold text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
						>
							<span className="h-1.25 w-9 rounded-full bg-border-strong" aria-hidden="true" />
							{layout.logOpen ? "ログをしまう" : "会話ログ"}
						</button>
						{layout.logOpen && (
							<div className="flex h-[40svh] shrink-0 flex-col border-y-2">{log}</div>
						)}
					</>
				)}

				<ChatBottomBar
					sessionId={currentId}
					needsModel={!llmReady && !!llm.data}
					approvals={(activeTurn?.steps ?? []).filter((s) => s.status === "awaiting" && s.approval)}
					choices={replying ? null : openChoices(messages)}
					choicesDisabled={!llmReady || sending || chat.sending}
					onChoose={(text) => sendText(text)}
					error={micError ?? chat.error}
					composer={{
						draft,
						onDraft: setDraft,
						images,
						onImages: setImages,
						placeholder: `${currentId ? name : "キャラクター"}に話しかける…`,
						canSend: llmReady && (!!draft.trim() || images.length > 0) && chat.canSend,
						onSend: () => {
							if (sendText(draft.trim(), images, () => setImages([]))) setDraft("");
						},
						captions: layout.captions,
						onCaptions: layout.setCaptions,
						mic: {
							...(micMode === "replying"
								? { onClick: stopReply }
								: { ...talk.buttonProps, disabled: !llmReady }),
							mode: micMode,
							level: micLevel,
							"aria-label": MIC_LABEL[micMode],
							title: MIC_LABEL[micMode],
						},
					}}
				/>
			</section>

			<ChatSidePane
				wide={wide}
				layout={layout}
				sessionId={currentId}
				messages={messages}
				log={log}
			/>

			{currentId && (
				<BrowserDialog
					open={browserOpen}
					onOpenChange={setBrowserOpen}
					sessionId={currentId}
					messages={messages}
				/>
			)}
		</div>
	);
}

/** Since when and how often the user has talked with the character. */
function talkedSince(messages: ChatMessage[]): string {
	const first = messages[0];
	if (!first) return "まだ話していません";
	const d = new Date(first.created_at * 1000);
	const turns = messages.filter((m) => m.role === "user").length;
	return `${d.getMonth() + 1}月${d.getDate()}日から ${turns} 回のやりとり`;
}
