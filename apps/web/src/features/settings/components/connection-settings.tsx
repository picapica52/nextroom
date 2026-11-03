import { DEFAULT_SPEECH_URL, OPENAI_COMPATIBLE, type ProviderStatus } from "@nextroom/contracts";
import { Dot, ErrorNote } from "@/components/status";
import { useProviders } from "@/hooks/queries";
import {
	ConnectionCheck,
	ElevenlabsCheck,
	FishAudioCheck,
	KeyBadge,
	KeyField,
	SpeechCheck,
	UrlField,
	useHasLlmProvider,
} from "./connection-fields";
import { ProviderActions, ProviderBadge } from "./provider-sign-in";
import {
	SettingsDisclosure,
	SettingsGroup,
	SettingsInset,
	SettingsPageBody,
	SettingsRow,
} from "./settings-layout";

/** Shown even before they are set up; the rest wait under "ほかのプロバイダー". */
const FEATURED = ["anthropic", "openai", "openrouter", "google", "xai", "github-copilot"];

/** Every account and key the app reaches a service with, in one place. */
export default function ConnectionSettings() {
	const ready = useHasLlmProvider();
	return (
		<SettingsPageBody>
			<SettingsGroup
				title="AI のプロバイダー"
				description="どれか 1 つを API キーかサブスクのサインインで設定すると、そのモデルを選べます"
				action={ready === false && <Dot tone="warning">未接続</Dot>}
			>
				<ProviderRows />
				<SettingsDisclosure
					id="openai_compatible_url"
					label="OpenAI 互換（Ollama・LM Studio など）"
				>
					<SettingsInset>
						<UrlField
							name="openai_compatible_url"
							label="URL"
							placeholder="http://127.0.0.1:11434/v1"
						/>
						<KeyField name="openai_compatible_key" label="API キー（任意）" optional />
						<ConnectionCheck provider={OPENAI_COMPATIBLE} />
					</SettingsInset>
				</SettingsDisclosure>
			</SettingsGroup>

			<SettingsGroup title="音声" description="読み上げと文字起こしに使います">
				<SettingsDisclosure id="speech_url" label="speech.cpp サーバー">
					<SettingsInset>
						<UrlField name="speech_url" label="URL" placeholder={DEFAULT_SPEECH_URL} />
						<SpeechCheck />
					</SettingsInset>
				</SettingsDisclosure>
				<SettingsDisclosure
					id="elevenlabs_key"
					label="ElevenLabs"
					status={<KeyBadge name="elevenlabs_key" />}
				>
					<SettingsInset>
						<KeyField name="elevenlabs_key" />
						<ElevenlabsCheck />
					</SettingsInset>
				</SettingsDisclosure>
				<SettingsDisclosure
					id="fish_audio_key"
					label="Fish Audio"
					status={<KeyBadge name="fish_audio_key" />}
				>
					<SettingsInset>
						<KeyField name="fish_audio_key" />
						<FishAudioCheck />
					</SettingsInset>
				</SettingsDisclosure>
			</SettingsGroup>

			<SettingsGroup title="そのほかのサービス" description="「道具」で使います">
				<SettingsDisclosure
					id="exa_key"
					label="Exa（Web 検索・話題さがし）"
					status={<KeyBadge name="exa_key" />}
				>
					<SettingsInset>
						<KeyField name="exa_key" />
					</SettingsInset>
				</SettingsDisclosure>
				<SettingsDisclosure
					id="composio_key"
					label="Composio（アプリ連携）"
					status={<KeyBadge name="composio_key" />}
				>
					<SettingsInset>
						<KeyField name="composio_key" />
					</SettingsInset>
				</SettingsDisclosure>
			</SettingsGroup>
		</SettingsPageBody>
	);
}

/** pi's providers: those set up, then the well-known ones, then the rest folded away. */
function ProviderRows() {
	const providers = useProviders();
	const all = providers.data ?? [];
	const rank = (p: ProviderStatus) => {
		const i = FEATURED.indexOf(p.id);
		return i === -1 ? FEATURED.length : i;
	};
	const shown = all
		.filter((p) => p.configured || FEATURED.includes(p.id))
		.sort((a, b) => Number(b.configured) - Number(a.configured) || rank(a) - rank(b));
	const rest = all.filter((p) => !shown.includes(p));
	return (
		<>
			{providers.error && (
				<div className="px-4 py-3">
					<ErrorNote error={providers.error} />
				</div>
			)}
			{shown.map((p) => (
				<ProviderRow key={p.id} provider={p} />
			))}
			{rest.length > 0 && (
				<SettingsDisclosure id="more-providers" label={`ほかのプロバイダー（${rest.length} 件）`}>
					<p className="m-0 text-xs text-muted-foreground">
						Gemini・Groq・Mistral・DeepSeek・Amazon Bedrock なども使えます。apps/server/.env
						にあるキーも使われます。
					</p>
					<SettingsInset>
						{rest.map((p) => (
							<ProviderRow key={p.id} provider={p} />
						))}
					</SettingsInset>
				</SettingsDisclosure>
			)}
		</>
	);
}

function ProviderRow({ provider }: { provider: ProviderStatus }) {
	return (
		<SettingsRow
			id={`provider-${provider.id}`}
			label={
				<span className="flex flex-wrap items-center gap-2">
					{provider.name}
					<ProviderBadge provider={provider} />
				</span>
			}
			control={<ProviderActions provider={provider} />}
		/>
	);
}
