import { pollShellSession } from "../agent/shell-session.js";

export const attachCommand = {
    name: "attach",
    description: "Show new output from a background shell session (/attach <id>)",
    async run({ args }) {
        const id = args[0];
        if (!id)
            return { message: "Usage: /attach <session-id>  (see /jobs)" };
        const result = await pollShellSession(id, 0);
        if (!result)
            return { message: `Unknown session: ${id}` };
        const status = result.status === "running" ? "running" : `${result.status} (exit ${result.exitCode ?? "?"})`;
        return { message: `[session ${id}] ${status}\n${result.output || "(no new output)"}` };
    },
};
