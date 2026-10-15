export const toolsCommand = {
    name: "tools",
    description: "Show local coding-agent tools.",
    run() {
        return {
            message: [
                "FastCode agent tools:",
                "",
                "  shell             Run terminal commands in the sandbox root",
                "  pwd               Print sandbox root",
                "  read_file         Read one file",
                "  read_many         Read multiple files",
                "  write_file        Replace/create a file",
                "  append_file       Append to a file",
                "  apply_patch       Apply focused patch hunks",
                "  replace_in_file   Replace exact text in a file",
                "  list_files        List files recursively",
                "  grep              Search files",
                "  stat_path         Inspect file metadata",
                "  make_dir          Create directories",
                "  copy_file         Copy a file",
                "  move_path         Move/rename a path",
                "  delete_file       Delete a path",
                "",
                "Sandbox: file tools are rooted at the current working directory.",
            ].join("\n"),
        };
    },
};
