import { loadConfig } from "../config/store.js";
import { getPaths } from "../config/paths.js";
export const configCommand = {
    name: "config",
    description: "Print effective config & paths.",
    run() {
        const cfg = loadConfig();
        const paths = getPaths();
        const lines = [
            "Config (~/.fastcode/config.json):",
            JSON.stringify(cfg, null, 2),
            "",
            "Paths:",
            `  root:     ${paths.root}`,
            `  config:   ${paths.config}`,
            `  auth:     ${paths.auth}`,
            `  skills:   ${paths.skills}`,
            `  plugins:  ${paths.plugins}`,
            `  cache:    ${paths.cache}`,
            `  sessions: ${paths.sessions}`,
        ];
        return { message: lines.join("\n") };
    },
};
