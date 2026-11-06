import type { ToolSchema } from "../types.js";

const CWD_NOTE = "Paths are relative to the session working directory unless absolute.";

export function toolSchemas(): ToolSchema[] {
    return [
        schema("shell", "Run a shell command. Long commands return a session id for polling. Killing a session kills its process group; setsid descendants may escape.", {
            command: { type: "string" },
            timeoutMs: { type: "number" },
            session_id: { type: "string", description: "Poll an existing background session." },
            waitMs: { type: "number", description: "Milliseconds to wait for new session output." },
        }),
        schema("pwd", "Print the current working directory.", {}),
        schema("read_file", "Read a file. Use offset/limit (1-based lines) for a targeted range in large files.", {
            path: { type: "string" },
            offset: { type: "number", minimum: 1, description: "First line to return (1-based)." },
            limit: { type: "number", minimum: 1, maximum: 2000, description: "Maximum lines to return (default 2000)." },
        }, ["path"]),
        schema("read_many", "Read several files under a shared byte budget.", {
            paths: { type: "array", items: { type: "string" } },
            maxBytes: { type: "number", minimum: 1, description: "Total output budget across all files." },
        }, ["paths"]),
        schema("write_file", "Replace a file with full contents.", {
            path: { type: "string" },
            content: { type: "string" },
        }, ["path", "content"]),
        schema("append_file", "Append text to a file.", {
            path: { type: "string" },
            content: { type: "string" },
        }, ["path", "content"]),
        schema("apply_patch", "Apply a multi-file patch (*** Begin Patch ... *** End Patch).", {
            patch: { type: "string" },
        }, ["patch"]),
        schema("copy_file", CWD_NOTE, {
            from: { type: "string" },
            to: { type: "string" },
            overwrite: { type: "boolean", description: "Replace an existing target explicitly (default false)." },
        }, ["from", "to"]),
        schema("delete_file", "Delete a file, or a directory with recursive:true.", {
            path: { type: "string" },
            recursive: { type: "boolean", description: "Required for directories (default false)." },
        }, ["path"]),
        schema("list_files", "List files under a directory.", {
            path: { type: "string" },
            maxDepth: { type: "number" },
            detail: { type: "boolean" },
        }),
        schema("make_dir", "Create a directory.", { path: { type: "string" } }, ["path"]),
        schema("move_path", "Move/rename a path; refuses an existing target.", {
            from: { type: "string" },
            to: { type: "string" },
        }, ["from", "to"]),
        schema("grep", "Search file contents with a regular expression.", {
            pattern: { type: "string" },
            path: { type: "string" },
            maxDepth: { type: "number", minimum: 1, maximum: 20 },
            caseSensitive: { type: "boolean", description: "Match case exactly (default false)." },
            glob: { type: "string", description: "Only search files matching this glob, e.g. *.ts." },
            context: { type: "number", minimum: 0, maximum: 10, description: "Context lines before/after each match." },
            maxResults: { type: "number", minimum: 1, maximum: 5000, description: "Stop after this many matching lines." },
        }, ["pattern"]),
        schema("replace_in_file", "Replace exact text occurrences; expectedMatches makes the count explicit.", {
            path: { type: "string" },
            find: { type: "string" },
            replace: { type: "string" },
            expectedMatches: { type: "number", minimum: 1, description: "Fail without writing unless this exact count is found." },
        }, ["path", "find", "replace"]),
        schema("stat_path", "Show file metadata.", { path: { type: "string" } }, ["path"]),
    ];
}

function schema(name: string, description: string, properties: Record<string, any>, required?: string[]): ToolSchema {
    return {
        type: "function",
        function: {
            name,
            description,
            parameters: {
                type: "object",
                properties,
                ...(required && required.length > 0 ? { required } : {}),
                additionalProperties: false,
            },
        },
    };
}
