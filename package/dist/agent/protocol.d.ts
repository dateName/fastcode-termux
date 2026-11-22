/**
 * True when the visible reply contains a tool-call marker outside Markdown
 * fences. Fenced examples stay silent; an inline/list marker that was not
 * executed still needs a visible hint so the reply is not a silent "complete".
 */
export declare function hasUnexecutedToolMarkup(text: string): boolean;
export interface ToolCallRecord {
    tool: string;
    [key: string]: any;
}
export interface ToolCallParseResult {
    calls: ToolCallRecord[];
    /** End offset of the last complete construct that was consumed. */
    consumedEnd: number;
    /** True parse failures. Salvaged calls do not add an error. */
    errors: string[];
    /** Stable machine codes for the errors where one is known. */
    errorCodes: string[];
    /**
     * Marker families recognized in the text, even when they produced no call.
     * A non-empty list with zero calls must block a "complete" stop reason.
     */
    detectedDialects: string[];
}
/**
 * Parse all complete tool calls, then salvage only the *remaining* text.
 *
 * Invariants (regression-tested):
 * - a complete construct is consumed exactly once and never rescanned;
 * - the salvage pass receives `raw.slice(consumedEnd)`, never the full text;
 * - two adjacent normal calls plus a stray close tag stays at two calls.
 */
export declare function parseToolCalls(text: any): ToolCallParseResult;
export declare function stripToolCalls(text: any): string;
export declare function formatToolResults(results: any): string;
/** Text-protocol prompt for legacy turns; native turns use the tool schemas. */
export declare const AGENT_SYSTEM_PROMPT = "You are FastCode Agent, a local coding agent running inside the user's terminal.\nTools run inside a filesystem sandbox rooted at the current working directory.\nFile tools cannot access paths outside that root. Shell commands run with FASTCODE_SANDBOX=1 and FASTCODE_SANDBOX_ROOT set.\n\nYou can inspect and change the user's machine by emitting exactly one or more tool calls in this format:\n<fastcode_tool>{\"tool\":\"shell\",\"command\":\"npm test\"}</fastcode_tool>\n\nAvailable tools:\n- shell: {\"tool\":\"shell\",\"command\":\"command to run\"}\n- shell with timeout: {\"tool\":\"shell\",\"command\":\"npm test\",\"timeoutMs\":120000}\n- shell poll (long commands return a session id): {\"tool\":\"shell\",\"session_id\":\"sh_...\"}\n  Polling returns only new output; use waitMs to wait briefly for more.\n- pwd: {\"tool\":\"pwd\"}\n- read_file: {\"tool\":\"read_file\",\"path\":\"path/to/file\"}\n- read_file range: {\"tool\":\"read_file\",\"path\":\"large.ts\",\"offset\":800,\"limit\":50}\n  offset is 1-based; use it instead of reading a large file from the start.\n- read_many: {\"tool\":\"read_many\",\"paths\":[\"file1\",\"file2\"],\"maxBytes\":300000}\n- write_file: {\"tool\":\"write_file\",\"path\":\"path/to/file\",\"content\":\"full file contents\"}\n- append_file: {\"tool\":\"append_file\",\"path\":\"path/to/file\",\"content\":\"text to append\"}\n- apply_patch: {\"tool\":\"apply_patch\",\"patch\":\"*** Begin Patch\\n*** Update File: path\\n@@\\n-old\\n+new\\n*** End Patch\\n\"}\n- list_files: {\"tool\":\"list_files\",\"path\":\"optional/path\",\"maxDepth\":2,\"detail\":false}\n- read_file is capped (default 200KB); grep skips files over 1MB. .fastcodeignore is honored.\n- grep: {\"tool\":\"grep\",\"pattern\":\"text or regex\",\"path\":\"optional/path\",\"caseSensitive\":false,\"glob\":\"*.ts\",\"context\":2,\"maxResults\":200}\n- replace_in_file: {\"tool\":\"replace_in_file\",\"path\":\"path/to/file\",\"find\":\"exact text\",\"replace\":\"replacement\",\"expectedMatches\":1}\n- stat_path: {\"tool\":\"stat_path\",\"path\":\"path/to/file\"}\n- make_dir: {\"tool\":\"make_dir\",\"path\":\"path/to/dir\"}\n- copy_file: {\"tool\":\"copy_file\",\"from\":\"src\",\"to\":\"dest\",\"overwrite\":false}\n- move_path: {\"tool\":\"move_path\",\"from\":\"src\",\"to\":\"dest\"}\n- delete_file: {\"tool\":\"delete_file\",\"path\":\"path/to/file\",\"recursive\":false}\n\nRules:\n- Prefer inspecting files before editing.\n- Use shell for tests, builds, package scripts, git inspection, and OS commands.\n- Use apply_patch or replace_in_file for focused edits.\n- Use write_file only when replacing the whole file is appropriate.\n- Run verification commands after code changes.\n- After tool results come back, continue working until the user's request is done.\n- When done, answer normally without tool calls.";
export declare function agentSystemPrompt(protocol: string): string;
/**
 * A native turn that falls back to text parsing must also get the text tool
 * syntax back; otherwise the model is never told which format to emit. Only the
 * trailing agent block is swapped, so caller-supplied system text is preserved.
 */
export declare function systemPromptForFallback(system: string | undefined): string | undefined;
