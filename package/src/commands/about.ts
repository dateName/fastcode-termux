import { platformLabel } from "../lib/platform.js";
import { t } from "../i18n/index.js";
export const aboutCommand = {
    name: "about",
    description: "Show version, platform, and links.",
    aliases: ["version"],
    run() {
        const lines = [
            t("about.tagline"),
            t("about.platform", { platform: platformLabel(), node: process.version }),
            ``,
            t("about.github", { url: "https://github.com/dateName/fastcode-termux" }),
            t("about.skills"),
        ];
        return { message: lines.join("\n") };
    },
};
