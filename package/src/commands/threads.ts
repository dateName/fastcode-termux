import type { CommandContext } from "../types.js";
import { DEFAULT_SHELL_POOL_SIZE, MAX_SHELL_POOL_SIZE, shellPoolSize } from "../agent/shell-session.js";

export const threadsCommand = {
    name: "threads",
    aliases: ["pool"],
    description: `Show or set resident shell concurrency (default ${DEFAULT_SHELL_POOL_SIZE}, max ${MAX_SHELL_POOL_SIZE}). Usage: /threads [1-${MAX_SHELL_POOL_SIZE}]`,
    run({ args, actions }: CommandContext) {
        const before = shellPoolSize();
        if (args.length === 0) {
            return {
                message: `Shell concurrency: ${before} resident slot(s) (default ${DEFAULT_SHELL_POOL_SIZE}, max ${MAX_SHELL_POOL_SIZE}). ` +
                    `Usage: /threads <1-${MAX_SHELL_POOL_SIZE}>.`,
            };
        }
        const requested = Number(args[0]);
        if (!Number.isFinite(requested)) {
            return { message: `Invalid thread count "${args[0]}". Use /threads <1-${MAX_SHELL_POOL_SIZE}>.` };
        }
        actions.setShellPoolSize(requested);
        const applied = shellPoolSize();
        const clamped = applied !== Math.floor(requested) ? " (clamped)" : "";
        return {
            message: `Shell concurrency: ${before} → ${applied}${clamped} (default ${DEFAULT_SHELL_POOL_SIZE}, max ${MAX_SHELL_POOL_SIZE}). ` +
                "Running jobs keep their slots.",
        };
    },
};
