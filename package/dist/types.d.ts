/**
 * Shared types used across FastCode.
 *
 * The provider abstraction is intentionally narrow — it only exposes
 * what the chat loop needs (streaming completions, model list, auth).
 * Providers can layer richer behavior on top in their own modules.
 */
export type Role = "system" | "user" | "assistant" | "tool";
export type ReasoningEffort = "auto" | "low" | "medium" | "high" | "max";
export interface NativeToolCall {
    id: string;
    name: string;
    arguments: string;
}
export interface ToolSchema {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, any>;
    };
}
export interface ChatMessage {
    role: Role;
    content: string;
    toolCalls?: NativeToolCall[];
    toolCallId?: string;
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
    /**
     * Requested thinking depth. Providers that support it map this to their
     * native parameter (`reasoning_effort`, `thinking.budget_tokens`, …);
     * providers that don't should ignore it.
     */
    reasoningEffort?: ReasoningEffort;
    /** AbortSignal for cancellation (Esc / Ctrl+C). */
    signal?: AbortSignal;
    /** Stable idempotency key reused across retries of the same logical request. */
    clientRequestId?: string;
    /** Native function-calling schemas (auto mode only). */
    tools?: ToolSchema[];
}
export interface ChatChunk {
    /** Token text appended to the response. */
    delta: string;
    /** True on the final chunk. */
    done: boolean;
    /** Complete native tool calls (OpenAI-style) on the final chunk. */
    toolCalls?: NativeToolCall[];
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
    /** Whether this provider/model honors ChatRequest.reasoningEffort. */
    supportsReasoning?(model: string): boolean;
}
export interface PickerItem {
    value: string;
    label: string;
    hint?: string;
}
/**
 * An interactive list a command can hand back to the app. The app renders it
 * with arrow keys, number shortcuts, and Enter (Esc cancels).
 */
export interface PickerRequest {
    title: string;
    items: PickerItem[];
    /** Currently selected value, highlighted on open. */
    current?: string;
    onSelect(value: string, item: PickerItem): void;
    onCancel?(): void;
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
    /** Open an interactive picker after the command runs. */
    picker?: PickerRequest;
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
    reasoningEffort: ReasoningEffort;
    expanded: boolean;
    busy: boolean;
}
export interface AppActions {
    setProvider(id: string): void;
    setModel(id: string): void;
    setTheme(id: string): void;
    setAgentMode(enabled: boolean): void;
    setSystemPrompt(prompt: string): void;
    setSkillsRegistry(url: string): void;
    setReasoningEffort(effort: ReasoningEffort): void;
    enableSkill(name: string): void;
    disableSkill(name: string): void;
    enablePlugin(name: string): void;
    disablePlugin(name: string): void;
    clearHistory(): void;
    replaceHistory(messages: ChatMessage[]): void;
    cancelRun(): void;
    steer(text: string): void;
    setExpanded(value: boolean): void;
    pushSystemMessage(text: string): void;
    /** Begin the guided API-key flow (choose provider → model → key). */
    startLogin(options: {
        provider?: string;
        model?: string;
    }): void;
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
