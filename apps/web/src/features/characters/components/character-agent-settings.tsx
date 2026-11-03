import {
	type CharacterView,
	type ModelChoice,
	TOOL_GROUPS,
	type ToolGroup,
} from "@nextroom/contracts";
import { Button } from "@nextroom/ui/components/button";
import { Checkbox } from "@nextroom/ui/components/checkbox";
import { Label } from "@nextroom/ui/components/label";
import { History, Undo2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useConfirm } from "@/components/confirm";
import { SaveTextarea } from "@/components/save-field";
import { SettingsSection } from "@/components/settings-section";
import { EmptyNote, ErrorNote } from "@/components/status";
import { TOOL_GROUP_LABELS } from "@/features/agent/labels";
import { useChatSettings } from "@/hooks/queries";
import { formatDate } from "@/lib/api";
import { useInstructionHistory, useSaveAgent } from "../queries";
import { ModelChoiceField, useModelChoiceText } from "./model-choice-field";

/** The 詳細 tab: the character's own model, the tools it does without, and its instructions. */
export function CharacterAgentSettings({ character }: { character: CharacterView }) {
	const save = useSaveAgent(character.id);
	const { agent } = character;
	return (
		<>
			<ErrorNote error={save.error} />
			<ModelSection
				characterId={character.id}
				value={agent.model}
				pending={save.isPending}
				onChange={(model) => save.mutate({ model })}
			/>
			<ToolsSection
				disabled={agent.disabled_tools}
				onChange={(disabled_tools) => save.mutate({ disabled_tools })}
			/>
			<InstructionsSection
				characterId={character.id}
				value={agent.instructions}
				onSave={async (instructions) => {
					try {
						await save.mutateAsync({ instructions });
					} catch {
						return false;
					}
				}}
			/>
		</>
	);
}

function ModelSection({
	characterId,
	value,
	pending,
	onChange,
}: {
	characterId: string;
	value: ModelChoice | null;
	pending: boolean;
	onChange: (model: ModelChoice | null) => void;
}) {
	const settings = useChatSettings();
	const main = settings.data?.main_model;
	const modelChoiceText = useModelChoiceText();
	return (
		<SettingsSection
			title="モデル"
			description={
				<>
					ふだんは
					<Link to="/settings/models">設定のメインモデル</Link>
					で返答します。このキャラクターだけ別のモデルにするときに選びます。
				</>
			}
		>
			<ModelChoiceField
				key={characterId}
				id="character-model"
				value={value}
				onChange={onChange}
				fallback="メインモデル"
				disabled={pending}
			/>
			<p className="m-0 text-xs text-muted-foreground">
				{value
					? `このキャラクターは ${modelChoiceText(value)} で返答します。`
					: main
						? `メインモデル（${modelChoiceText(main)}）で返答します。`
						: "メインモデルがまだ選ばれていません。"}
			</p>
		</SettingsSection>
	);
}

function ToolsSection({
	disabled,
	onChange,
}: {
	disabled: ToolGroup[];
	onChange: (disabled: ToolGroup[]) => void;
}) {
	const toggle = (group: ToolGroup, off: boolean) =>
		onChange(
			off
				? TOOL_GROUPS.filter((g) => g === group || disabled.includes(g))
				: disabled.filter((g) => g !== group),
		);
	return (
		<SettingsSection
			title="ツールを無効にする"
			description="チェックしたツールを、このキャラクターは使いません。設定でオフのツールは、ここに関係なく使えません。記憶はいつでも使えます。"
		>
			<div className="grid gap-3 sm:grid-cols-2">
				{TOOL_GROUPS.map((group) => (
					<div key={group} className="flex items-center gap-2.5">
						<Checkbox
							id={`disable-${group}`}
							checked={disabled.includes(group)}
							onCheckedChange={(checked) => toggle(group, checked)}
						/>
						<Label htmlFor={`disable-${group}`}>{TOOL_GROUP_LABELS[group]}</Label>
					</div>
				))}
			</div>
		</SettingsSection>
	);
}

function InstructionsSection({
	characterId,
	value,
	onSave,
}: {
	characterId: string;
	value: string;
	onSave: (instructions: string) => Promise<false | undefined>;
}) {
	return (
		<SettingsSection
			title="指示"
			description="このキャラクターにいつも守らせたいことです。設定の共通の指示のあとに加わります。"
		>
			<SaveTextarea
				key={characterId}
				value={value}
				onSave={onSave}
				rows={8}
				placeholder="例: 返事は短めに。予定の話になったら、カレンダーを確認してから答える。"
			/>
			<InstructionHistory characterId={characterId} current={value} onRestore={onSave} />
		</SettingsSection>
	);
}

function InstructionHistory({
	characterId,
	current,
	onRestore,
}: {
	characterId: string;
	current: string;
	onRestore: (instructions: string) => Promise<unknown>;
}) {
	const history = useInstructionHistory(characterId);
	const confirm = useConfirm();
	const restore = async (instructions: string) => {
		const ok = await confirm({
			title: "この指示に戻しますか？",
			description: "いまの指示も履歴に残るので、あとから戻せます。",
			action: "元に戻す",
		});
		if (ok) await onRestore(instructions);
	};
	return (
		<details className="group rounded-lg border-2">
			<summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-bold select-none">
				<History className="size-4 text-muted-foreground" />
				指示の履歴
				{history.data && (
					<span className="text-xs font-normal text-muted-foreground">
						{history.data.length} 件
					</span>
				)}
			</summary>
			<div className="flex flex-col gap-2 border-t-2 p-3">
				<ErrorNote error={history.error} />
				{history.data?.length === 0 && (
					<EmptyNote className="py-4">まだ指示を変えたことがありません</EmptyNote>
				)}
				{history.data?.map((r) => {
					const isCurrent = r.instructions === current;
					return (
						<div key={r.revision} className="flex items-start gap-3 rounded-md bg-muted px-3 py-2">
							<div className="flex min-w-0 flex-1 flex-col gap-1">
								<span className="text-xs text-muted-foreground tabular-nums">
									{formatDate(r.created_at)}
									{isCurrent && "（いまの指示）"}
								</span>
								<p className="m-0 line-clamp-2 text-xs whitespace-pre-wrap">
									{r.instructions || <span className="text-muted-foreground">（空）</span>}
								</p>
							</div>
							<Button
								variant="ghost"
								size="sm"
								disabled={isCurrent}
								onClick={() => void restore(r.instructions)}
							>
								<Undo2 />
								元に戻す
							</Button>
						</div>
					);
				})}
			</div>
		</details>
	);
}
