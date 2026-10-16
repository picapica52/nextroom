import type { AgentSettingsView, DockerStatus } from "@nextroom/contracts";
import { Field, FieldDescription, FieldLabel } from "@nextroom/ui/components/field";
import { SaveInput } from "@/components/save-field";
import { SimpleSelect } from "@/components/simple-select";
import { Dot } from "@/components/status";
import type { SetAgentSection } from "../agent-options";
import { NumberField, SwitchRow } from "./settings-fields";

export const sandboxToolSummary = (
	sandbox: AgentSettingsView["sandbox"],
	docker: DockerStatus | undefined,
) =>
	sandbox.provider === "local"
		? "この PC で直接実行（隔離なし）"
		: docker?.ok
			? `Docker の中で実行 ・ Docker ${docker.version} に接続済み`
			: "Docker の中で実行 ・ Docker に接続できません";

export function SandboxToolSettings({
	sandbox,
	docker,
	set,
}: {
	sandbox: AgentSettingsView["sandbox"];
	docker: DockerStatus | undefined;
	set: SetAgentSection;
}) {
	return (
		<>
			<Field>
				<FieldLabel htmlFor="provider">実行場所</FieldLabel>
				<SimpleSelect
					id="provider"
					value={sandbox.provider}
					onChange={(provider) => provider && set("sandbox", { provider })}
					options={[
						{ value: "docker", label: "Docker（コンテナの中・おすすめ）" },
						{ value: "local", label: "この PC で直接（隔離なし）" },
					]}
				/>
				{sandbox.provider === "docker" ? (
					<FieldDescription>
						{docker?.ok ? (
							<Dot tone="success">Docker {docker.version} に接続できます</Dot>
						) : (
							<Dot tone="destructive">
								Docker に接続できません。Docker Desktop を起動してください
							</Dot>
						)}
					</FieldDescription>
				) : (
					<FieldDescription className="text-warning">
						Windows では隔離されません。キャラクターのコマンドがこの PC 上でそのまま動きます。
					</FieldDescription>
				)}
			</Field>
			{sandbox.provider === "docker" && (
				<>
					<Field>
						<FieldLabel htmlFor="image">イメージ</FieldLabel>
						<SaveInput
							id="image"
							className="font-mono"
							value={sandbox.image}
							onSave={(image) => set("sandbox", { image })}
						/>
					</Field>
					<div className="grid grid-cols-3 gap-3">
						<NumberField
							id="mem"
							label="メモリ上限（MB）"
							value={sandbox.memory_mb}
							min={128}
							step={256}
							onChange={(memory_mb) => set("sandbox", { memory_mb })}
						/>
						<NumberField
							id="cpus"
							label="CPU"
							value={sandbox.cpus}
							min={0.25}
							step={0.5}
							onChange={(cpus) => set("sandbox", { cpus })}
						/>
						<NumberField
							id="timeout"
							label="コマンドの制限時間（秒）"
							value={sandbox.timeout_sec}
							min={5}
							step={30}
							onChange={(timeout_sec) => set("sandbox", { timeout_sec })}
						/>
					</div>
					<SwitchRow
						id="network"
						label="ネットワークを使う"
						description="オフにするとコンテナからインターネットに出られません（パッケージのインストールもできなくなります）。"
						checked={sandbox.network}
						onChange={(network) => set("sandbox", { network })}
					/>
				</>
			)}
		</>
	);
}
