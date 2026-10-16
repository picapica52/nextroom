/** Query keys of the server's data. A key called without its id is the prefix of every one of
 *  its kind, for refreshing them all. */
export const qk = {
	status: () => ["status"] as const,
	engineJobs: () => ["engine-jobs"] as const,
	speechModels: () => ["speech-models"] as const,
	elevenlabsVoices: () => ["elevenlabs-voices"] as const,
	chatSettings: () => ["chat-settings"] as const,
	agentSettings: () => ["agent-settings"] as const,
	llmModels: (provider?: string) =>
		provider === undefined ? ["llm-models"] : ["llm-models", provider],
	openrouterImageModels: (output?: string) =>
		output === undefined ? ["openrouter-image-models"] : ["openrouter-image-models", output],
	docker: () => ["docker"] as const,
	composio: () => ["composio"] as const,
	discord: () => ["discord"] as const,
	chatSessions: () => ["chat-sessions"] as const,
	chat: (id?: string | null) => (id === undefined ? ["chat"] : ["chat", id]),
	browser: (sessionId: string | null) => ["browser", sessionId] as const,
	characters: () => ["characters"] as const,
	character: (id?: string | null) => (id === undefined ? ["character"] : ["character", id]),
	affinity: (characterId?: string | null) =>
		characterId === undefined ? ["affinity"] : ["affinity", characterId],
	expressionBatch: (characterId: string) => ["expression-batch", characterId] as const,
	memory: (characterId: string | null) => ["memory", characterId] as const,
	voiceRefs: (characterId: string) => ["voice-refs", characterId] as const,
	workspaceFiles: (characterId: string, version?: number) =>
		version === undefined
			? ["workspace-files", characterId]
			: ["workspace-files", characterId, version],
};
