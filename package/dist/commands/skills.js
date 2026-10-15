import { installSkill, uninstallSkill, listInstalledSkills, searchRegistry, getSkill, } from "../skills/manager.js";
export const skillsCommand = {
    name: "skills",
    description: "Manage Agent Skills (download from skills.sh and toggle).",
    async run({ args, state, actions }) {
        const sub = (args[0] ?? "list").toLowerCase();
        const rest = args.slice(1);
        if (sub === "list" || sub === "ls") {
            const installed = listInstalledSkills();
            if (installed.length === 0) {
                return {
                    message: "No skills installed. Try `/skills search <query>` or `/skills install <name>`.",
                };
            }
            const lines = ["Installed skills:"];
            for (const s of installed) {
                const enabled = state.enabledSkills.includes(s.name) ? "● " : "  ";
                lines.push(`${enabled}${s.name}  — ${truncate(s.description, 80)}`);
                lines.push(`    source: ${s.source}`);
            }
            lines.push("");
            lines.push("Toggle with `/skills enable <name>` or `/skills disable <name>`.");
            return { message: lines.join("\n") };
        }
        if (sub === "search") {
            if (rest.length === 0)
                return { message: "Usage: /skills search <query>" };
            const hits = await searchRegistry(rest.join(" "), state.skillsRegistry);
            if (hits.length === 0) {
                return { message: `No skills found for "${rest.join(" ")}".` };
            }
            const lines = [`Skills matching "${rest.join(" ")}":`];
            for (const h of hits.slice(0, 20)) {
                lines.push(`  • ${h.slug}  — ${truncate(h.description ?? "", 80)}`);
            }
            lines.push("");
            lines.push("Install with `/skills install <slug>`.");
            return { message: lines.join("\n") };
        }
        if (sub === "install" || sub === "add") {
            if (rest.length === 0)
                return { message: "Usage: /skills install <name|owner/repo|url>" };
            const force = rest.includes("--force");
            const spec = rest.filter((r) => r !== "--force").join(" ");
            try {
                const skill = await installSkill(spec, { registry: state.skillsRegistry, force });
                return {
                    message: `Installed skill "${skill.name}" → ${skill.path}\n${truncate(skill.description, 200)}\n\nEnable with /skills enable ${skill.name}`,
                };
            }
            catch (err) {
                return { message: `Install failed: ${err.message}` };
            }
        }
        if (sub === "uninstall" || sub === "remove" || sub === "rm") {
            if (rest.length === 0)
                return { message: "Usage: /skills uninstall <name>" };
            const ok = uninstallSkill(rest[0]);
            if (ok)
                actions.disableSkill(rest[0]);
            return { message: ok ? `Uninstalled "${rest[0]}".` : `No skill named "${rest[0]}".` };
        }
        if (sub === "enable" || sub === "use") {
            if (rest.length === 0)
                return { message: "Usage: /skills enable <name>" };
            const skill = getSkill(rest[0]);
            if (!skill)
                return { message: `Skill "${rest[0]}" is not installed.` };
            actions.enableSkill(skill.name);
            return { message: `Enabled skill "${skill.name}".` };
        }
        if (sub === "disable" || sub === "off") {
            if (rest.length === 0)
                return { message: "Usage: /skills disable <name>" };
            actions.disableSkill(rest[0]);
            return { message: `Disabled skill "${rest[0]}".` };
        }
        if (sub === "info" || sub === "show") {
            if (rest.length === 0)
                return { message: "Usage: /skills info <name>" };
            const skill = getSkill(rest[0]);
            if (!skill)
                return { message: `Skill "${rest[0]}" is not installed.` };
            const head = `# ${skill.name}\n_${skill.description}_\n\nSource: ${skill.source}\n\n---\n\n`;
            return { message: head + skill.body };
        }
        if (sub === "registry") {
            if (rest.length === 0) {
                return { message: `Skills registry: ${state.skillsRegistry}` };
            }
            // Mutate via AppActions so the in-memory React state stays in sync —
            // direct saveConfig() would be silently overwritten by the next state
            // change because app.tsx persists in-memory config on every update.
            actions.setSkillsRegistry(rest[0]);
            return { message: `Skills registry set to ${rest[0]}.` };
        }
        return {
            message: "Unknown subcommand. Try: list, search, install, uninstall, enable, disable, info, registry.",
        };
    },
};
function truncate(s, n) {
    if (s.length <= n)
        return s;
    return s.slice(0, n - 1) + "…";
}
