import { killShellSession, listShellSessions } from "../agent/shell-session.js";

export const killCommand = {
    name: "kill",
    description: "Kill a background shell session (/kill [id])",
    run(ctx) {
        const { args, actions } = ctx;
        const id = args[0];
        if (!id) {
            const jobs = listShellSessions();
            if (jobs.length === 0)
                return { message: "No shell sessions to kill. See /jobs." };
            return {
                message: "Choose a session to kill.",
                picker: {
                    title: "Kill shell session",
                    items: jobs.map((job) => ({
                        value: job.id,
                        label: job.id,
                        hint: `${job.status} · ${job.command.length > 60 ? job.command.slice(0, 57) + "…" : job.command}`,
                    })),
                    onSelect: (value) => {
                        actions.pushSystemMessage(killShellSession(value)
                            ? `Killed ${value} (process group killed; setsid descendants may escape).`
                            : `No running session named ${value}.`);
                    },
                },
            };
        }
        return { message: killShellSession(id)
                ? `Killed ${id} (process group killed; setsid descendants may escape).`
                : `No running session named ${id}.` };
    },
};
