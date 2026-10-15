import { getPlugin, importPlugin, listInstalledPlugins, removePlugin, } from "../plugins/manager.js";
export const pluginCommand = {
    name: "plugin",
    description: "Manage always-active plugin packs. Usage: /plugin [list|import|enable|disable|remove|info]",
    run({ args, state, actions }) {
        const sub = (args[0] ?? "list").toLowerCase();
        if (sub === "list") {
            const plugins = listInstalledPlugins();
            if (plugins.length === 0)
                return { message: "No plugins installed. Import one with /plugin import <path> [name]." };
            return {
                message: [
                    "Installed plugins:",
                    "",
                    ...plugins.map((p) => {
                        const enabled = state.enabledPlugins.includes(p.name) ? "●" : " ";
                        return `${enabled} ${p.name} — ${p.description}`;
                    }),
                ].join("\n"),
            };
        }
        if (sub === "import") {
            const source = args[1];
            if (!source)
                return { message: "Usage: /plugin import <folder-path> [name]" };
            const plugin = importPlugin(source, args[2]);
            actions.enablePlugin(plugin.name);
            return { message: `Imported and enabled plugin ${plugin.name}.` };
        }
        if (sub === "enable") {
            const name = args[1];
            if (!name)
                return { message: "Usage: /plugin enable <name>" };
            const plugin = getPlugin(name);
            if (!plugin)
                return { message: `Plugin not found: ${name}` };
            actions.enablePlugin(plugin.name);
            return { message: `Enabled plugin ${plugin.name}.` };
        }
        if (sub === "disable") {
            const name = args[1];
            if (!name)
                return { message: "Usage: /plugin disable <name>" };
            actions.disablePlugin(name);
            return { message: `Disabled plugin ${name}.` };
        }
        if (sub === "remove") {
            const name = args[1];
            if (!name)
                return { message: "Usage: /plugin remove <name>" };
            actions.disablePlugin(name);
            return { message: removePlugin(name) ? `Removed plugin ${name}.` : `Plugin not found: ${name}` };
        }
        if (sub === "info") {
            const name = args[1];
            if (!name)
                return { message: "Usage: /plugin info <name>" };
            const plugin = getPlugin(name);
            if (!plugin)
                return { message: `Plugin not found: ${name}` };
            return {
                message: [
                    `Plugin: ${plugin.name}`,
                    `Path: ${plugin.path}`,
                    `Description: ${plugin.description}`,
                    `Skills: ${plugin.skills.map((s) => s.name).join(", ") || "none"}`,
                    "",
                    plugin.body.slice(0, 4000),
                ].join("\n"),
            };
        }
        return { message: "Usage: /plugin [list|import|enable|disable|remove|info]" };
    },
};
