export const bgCommand = {
    name: "bg",
    description: "Explain backgrounding (long shell commands auto-background after ~2s)",
    run() {
        return {
            message: "Long shell commands already return a session id after ~2s; use /jobs to list them, /attach <id> for new output, /kill <id> to stop.",
        };
    },
};
