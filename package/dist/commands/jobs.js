import { listShellSessions } from "../agent/shell-session.js";
export const jobsCommand = {
    name: "jobs",
    description: "List background shell sessions",
    run() {
        const jobs = listShellSessions();
        if (jobs.length === 0)
            return { message: "No shell sessions. Long commands return a session id automatically." };
        const lines = jobs.map((job) => {
            const exit = job.exitCode === undefined || job.exitCode === null ? "" : ` exit=${job.exitCode}`;
            const age = Math.max(0, Math.round((Date.now() - job.startedAt) / 1000));
            const command = job.command.length > 80 ? job.command.slice(0, 77) + "…" : job.command;
            return `${job.id}  ${job.status}${exit}  ${age}s  ${(job.bytes / 1024).toFixed(1)}KB  ${command}`;
        });
        return { message: ["Shell sessions:", ...lines, "", "Kill one with: /kill <id>", "Completed sessions are pruned after 10 minutes; resident pool cap is 2."].join("\n") };
    },
};
