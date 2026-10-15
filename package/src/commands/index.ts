import { agentCommand } from "./agent.js";
import { cwdCommand } from "./cwd.js";
import { helpCommand } from "./help.js";
import { pluginCommand } from "./plugin.js";
import { toolsCommand } from "./tools.js";
import { clearCommand } from "./clear.js";
import { exitCommand } from "./exit.js";
import { modelCommand } from "./model.js";
import { providerCommand } from "./provider.js";
import { loginCommand } from "./login.js";
import { logoutCommand } from "./logout.js";
import { skillsCommand } from "./skills.js";
import { themeCommand } from "./theme.js";
import { costCommand } from "./cost.js";
import { resetCommand } from "./reset.js";
import { systemCommand } from "./system.js";
import { aboutCommand } from "./about.js";
import { configCommand } from "./config.js";
import { whoamiCommand } from "./whoami.js";
export const COMMANDS = [
    helpCommand,
    agentCommand,
    toolsCommand,
    cwdCommand,
    pluginCommand,
    clearCommand,
    exitCommand,
    modelCommand,
    providerCommand,
    loginCommand,
    logoutCommand,
    skillsCommand,
    themeCommand,
    costCommand,
    resetCommand,
    systemCommand,
    aboutCommand,
    configCommand,
    whoamiCommand,
];
export function findCommand(name) {
    const lower = name.toLowerCase();
    return COMMANDS.find((c) => c.name === lower || (c.aliases ?? []).includes(lower));
}
/** Parse a raw input string. Returns undefined if it's not a slash command. */
export function parseSlash(input) {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/"))
        return undefined;
    const tokens = trimmed.slice(1).split(/\s+/);
    const head = tokens.shift() ?? "";
    if (!head)
        return undefined;
    return { name: head, args: tokens, raw: trimmed };
}
export async function runCommand(cmd, ctx) {
    return await cmd.run(ctx);
}
