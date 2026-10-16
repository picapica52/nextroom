import type { AgentStep } from "@nextroom/contracts";
import type { ComponentProps } from "react";
import { Link } from "react-router-dom";
import { ErrorNote } from "@/components/status";
import { ChoiceCard } from "./choice-card";
import { Composer } from "./composer";
import { ApprovalCard } from "./reply";

/** Under the face: what needs doing first (a reply model, approvals, choices), errors, and the bar
 *  to talk from. */
export function ChatBottomBar({
	sessionId,
	needsModel,
	approvals,
	choices,
	choicesDisabled,
	onChoose,
	error,
	composer,
}: {
	sessionId: string | null;
	/** No reply model is chosen yet. */
	needsModel: boolean;
	/** Tool calls waiting for the user's answer. */
	approvals: AgentStep[];
	/** The question the last reply ended with, while it is open. */
	choices: AgentStep | null;
	choicesDisabled: boolean;
	onChoose: (text: string) => void;
	error: unknown;
	composer: ComponentProps<typeof Composer>;
}) {
	return (
		<div className="flex shrink-0 flex-col gap-2 px-3 pt-3 pb-3 sm:px-3.5 sm:pb-4">
			{needsModel && (
				<p className="m-0 text-sm text-warning">
					<Link to="/settings/models" className="text-warning">
						設定 → モデル
					</Link>
					で接続先とモデルを指定してください。
				</p>
			)}
			{sessionId &&
				approvals.map((s) => <ApprovalCard key={s.id} sessionId={sessionId} step={s} />)}
			{sessionId && choices && (
				<ChoiceCard
					key={choices.id}
					step={choices}
					disabled={choicesDisabled}
					onChoose={onChoose}
				/>
			)}
			<ErrorNote error={error} />
			<Composer {...composer} />
		</div>
	);
}
