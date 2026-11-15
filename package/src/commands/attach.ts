import { listShellSessions, pollShellSession } from "../agent/shell-session.js";

function sessionLabel(job) {
    const command = job.command.length > 60 ? job.command.slice(0, 57) + "…" : job.command;
    return `${job.status} · ${command}`;
}

async function showNewOutput(id, push) {
    const result = await pollShellSession(id, 0);
    if (!result) {
        push(`Unknown session: ${id}`);
        return;
    }
    const status = result.status === "running" ? "running" : `${result.status} (exit ${result.exitCode ?? "?"})`;
    push(`[session ${id}] ${status}\n${result.output || "(no new output)"}`);
}

export const attachCommand = {
    name: "attach",
    description: "Show new output from a background shell session (/attach [id])",
    async run({ args, actions }) {
        const id = args[0];
        if (!id) {
            const jobs = listShellSessions();
            if (jobs.length === 0)
                return { message: "No shell sessions. Long commands return a session id automatically." };
            return {
                message: "Choose a session to attach.",
                picker: {
                    title: "Attach to shell session",
                    items: jobs.map((job) => ({ value: job.id, label: job.id, hint: sessionLabel(job) })),
                    onSelect: (value) => showNewOutput(value, actions.pushSystemMessage),
                },
            };
        }
        const result = await pollShellSession(id, 0);
        if (!result)
            return { message: `Unknown session: ${id}` };
        const status = result.status === "running" ? "running" : `${result.status} (exit ${result.exitCode ?? "?"})`;
        return { message: `[session ${id}] ${status}\n${result.output || "(no new output)"}` };
    },
};
