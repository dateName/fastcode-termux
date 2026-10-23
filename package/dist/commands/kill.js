import { killShellSession } from "../agent/shell-session.js";
export const killCommand = {
    name: "kill",
    description: "Kill a background shell session (/kill <id>)",
    run(ctx) {
        const id = ctx.args[0];
        if (!id)
            return { message: "Usage: /kill <session-id>  (see /jobs)" };
        return { message: killShellSession(id) ? `Killed ${id} (process tree).` : `No running session named ${id}.` };
    },
};
