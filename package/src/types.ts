/**
 * Shared types used across FastCode.
 *
 * The provider abstraction is intentionally narrow — it only exposes
 * what the chat loop needs (streaming completions, model list, auth).
 * Providers can layer richer behavior on top in their own modules.
 */
export type Role = "system" | "user" | "assistant";
export interface ChatMessage {
    role: Role;
    content: string;
}
export interface ChatRequest {
    model: string;
    messages: ChatMessage[];
    /** Optional system prompt. Some providers fold this into messages. */
    system?: string;
    /** Sampling temperature. */
    temperature?: number;
    /** Soft cap for output tokens. */
    maxOutputTokens?: number;
    /** AbortSignal for cancellation (Esc / Ctrl+C). */
    signal?: AbortSignal;
}
export interface ChatChunk {
    /** Token text appended to the response. */
    delta: string;
    /** True on the final chunk. */
    done: boolean;
    /** Provider-specific usage info on the final chunk. */
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
        /** Approximate cost in USD if known. */
        costUsd?: number;
    };
}
export type ChatStream = AsyncIterable<ChatChunk>;
export interface ProviderModel {
    id: string;
    label?: string;
    /** Optional context window in tokens. */
    contextWindow?: number;
    /** Pricing per 1M tokens, used for cost estimation. */
    pricing?: {
        inputUsdPerM?: number;
        outputUsdPerM?: number;
    };
}
export interface Provider {
    /** Unique id, e.g. "anthropic". */
    id: string;
    /** Human label. */
    label: string;
    /** ENV var(s) that, when set, satisfy auth. */
    authEnv: string[];
    /** Base URL — many providers expose OpenAI-compatible endpoints. */
    baseUrl: string;
    /** Default model id when the user hasn't picked one. */
    defaultModel: string;
    /** Static or dynamic list of supported models. */
    listModels(apiKey: string | undefined): Promise<ProviderModel[]>;
    /** Stream a chat completion. */
    stream(req: ChatRequest, apiKey: string | undefined): ChatStream;
}
export interface SlashCommand {
    name: string;
    description: string;
    /** Optional aliases users can also type. */
    aliases?: string[];
    /** Hide from /help (useful for power-user commands). */
    hidden?: boolean;
    /** Execute the command. Return text to render, or undefined for no output. */
    run(ctx: CommandContext): Promise<CommandResult> | CommandResult;
}
export interface CommandResult {
    /** Text rendered as a system message in the transcript. */
    message?: string;
    /** Mark this turn as silent (no echo of the slash itself). */
    silent?: boolean;
    /** Quit the app after this command. */
    quit?: boolean;
}
export interface CommandContext {
    args: string[];
    raw: string;
    state: AppStateSnapshot;
    actions: AppActions;
}
export interface AppStateSnapshot {
    providerId: string;
    model: string;
    theme: string;
    agentMode: boolean;
    history: ChatMessage[];
    systemPrompt: string;
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    enabledSkills: string[];
    enabledPlugins: string[];
    skillsRegistry: string;
}
export interface AppActions {
    setProvider(id: string): void;
    setModel(id: string): void;
    setTheme(id: string): void;
    setAgentMode(enabled: boolean): void;
    setSystemPrompt(prompt: string): void;
    setSkillsRegistry(url: string): void;
    enableSkill(name: string): void;
    disableSkill(name: string): void;
    enablePlugin(name: string): void;
    disablePlugin(name: string): void;
    clearHistory(): void;
    pushSystemMessage(text: string): void;
    /** Begin the guided API-key flow (choose provider → model → key). */
    startLogin(options: { provider?: string; model?: string }): void;
}
export interface SkillManifest {
    name: string;
    description: string;
    /** Where the skill came from (e.g. "skills.sh", "anthropics/skills"). */
    source: string;
    /** Local on-disk path to the skill folder. */
    path: string;
    /** Raw SKILL.md body (the prompt content). */
    body: string;
}
export interface Theme {
    id: string;
    label: string;
    banner: [string, string, string];
    user: string;
    assistant: string;
    system: string;
    border: string;
    accent: string;
    muted: string;
    error: string;
    success: string;
}
