/** Query keys of the server's data. A key called without its id is the prefix of every one of
 *  its kind, for refreshing them all. */
export const qk = {
	status: () => ["status"] as const,
	engineJobs: () => ["engine-jobs"] as const,
	speechModels: () => ["speech-models"] as const,
	elevenlabsVoices: () => ["elevenlabs-voices"] as const,
	fishAudioVoices: () => ["fish-audio-voices"] as const,
	fishAudioSearch: (title: string) => ["fish-audio-voices", "search", title] as const,
	fishAudioVoice: (id: string) => ["fish-audio-voices", "one", id] as const,
	chatSettings: () => ["chat-settings"] as const,
	connections: () => ["connections"] as const,
	providers: () => ["providers"] as const,
	providerLogin: (id: string | null) => ["provider-login", id] as const,
	agentSettings: () => ["agent-settings"] as const,
	llmModels: (provider?: string) =>
		provider === undefined ? ["llm-models"] : ["llm-models", provider],
	docker: () => ["docker"] as const,
	composio: () => ["composio"] as const,
	composioCatalog: () => ["composio", "catalog"] as const,
	discord: () => ["discord"] as const,
	slack: () => ["slack"] as const,
	chatSessions: () => ["chat-sessions"] as const,
	chat: (id?: string | null) => (id === undefined ? ["chat"] : ["chat", id]),
	desktop: (characterId: string | null) => ["desktop", characterId] as const,
	characters: () => ["characters"] as const,
	character: (id?: string | null) => (id === undefined ? ["character"] : ["character", id]),
	affinity: (characterId?: string | null) =>
		characterId === undefined ? ["affinity"] : ["affinity", characterId],
	memory: (characterId: string | null) => ["memory", characterId] as const,
	voiceRefs: (characterId: string) => ["voice-refs", characterId] as const,
	workspaceFiles: (characterId: string, version?: number) =>
		version === undefined
			? ["workspace-files", characterId]
			: ["workspace-files", characterId, version],
};
