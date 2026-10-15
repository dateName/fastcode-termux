import { PROVIDERS } from "../providers/index.js";
import { loadAuth } from "../config/store.js";
export const whoamiCommand = {
    name: "whoami",
    description: "Show which provider keys are configured.",
    run() {
        const auth = loadAuth();
        const lines = ["Authentication status:"];
        for (const p of PROVIDERS) {
            const stored = auth.keys[p.id] ? "stored" : "—";
            const env = p.authEnv.find((v) => process.env[v]);
            const status = p.authEnv.length === 0 ? "no auth" : env ? `env: ${env}` : stored;
            lines.push(`  ${p.id.padEnd(12)} ${status}`);
        }
        return { message: lines.join("\n") };
    },
};
