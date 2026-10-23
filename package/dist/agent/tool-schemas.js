const CWD_NOTE = "Paths are relative to the session working directory unless absolute.";
export function toolSchemas() {
    return [
        schema("shell", "Run a shell command. Long commands return a session id for polling.", {
            command: { type: "string" },
            timeoutMs: { type: "number" },
            session_id: { type: "string", description: "Poll an existing background session." },
            waitMs: { type: "number", description: "Milliseconds to wait for new session output." },
        }),
        schema("pwd", "Print the current working directory.", {}),
        schema("read_file", CWD_NOTE, { path: { type: "string" } }, ["path"]),
        schema("read_many", CWD_NOTE, { paths: { type: "array", items: { type: "string" } } }, ["paths"]),
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
        schema("copy_file", CWD_NOTE, { from: { type: "string" }, to: { type: "string" } }, ["from", "to"]),
        schema("delete_file", "Delete a file or directory.", { path: { type: "string" } }, ["path"]),
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
            maxDepth: { type: "number" },
        }, ["pattern"]),
        schema("replace_in_file", "Replace an exact text occurrence.", {
            path: { type: "string" },
            find: { type: "string" },
            replace: { type: "string" },
        }, ["path", "find", "replace"]),
        schema("stat_path", "Show file metadata.", { path: { type: "string" } }, ["path"]),
    ];
}
function schema(name, description, properties, required) {
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
