import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, } from "node:fs";
import { basename, join, resolve } from "node:path";
import { getPaths } from "../config/paths.js";
export function listInstalledPlugins() {
    const { plugins } = getPaths();
    if (!existsSync(plugins))
        return [];
    return readdirSync(plugins, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => loadPlugin(join(plugins, entry.name), entry.name))
        .filter((plugin) => plugin !== undefined)
        .sort((a, b) => a.name.localeCompare(b.name));
}
export function getPlugin(name) {
    return listInstalledPlugins().find((p) => p.name === name || basename(p.path) === name);
}
export function importPlugin(source, name) {
    const { plugins } = getPaths();
    const src = resolve(source);
    if (!existsSync(src))
        throw new Error(`Plugin source does not exist: ${source}`);
    if (!statSync(src).isDirectory())
        throw new Error("Plugin source must be a directory");
    const folder = slugify(name ?? basename(src));
    const target = join(plugins, folder);
    if (existsSync(target))
        rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    cpSync(src, target, { recursive: true });
    writeFileSync(join(target, ".fastcode-source"), src);
    const loaded = loadPlugin(target, folder);
    if (!loaded)
        throw new Error("Plugin must include PLUGIN.md, README.md, or at least one SKILL.md");
    return loaded;
}
export function removePlugin(name) {
    const plugin = getPlugin(name);
    if (!plugin)
        return false;
    rmSync(plugin.path, { recursive: true, force: true });
    return true;
}
export function buildPluginsPrompt(enabled) {
    if (enabled.length === 0)
        return "";
    const plugins = enabled.map(getPlugin).filter((p) => p !== undefined);
    if (plugins.length === 0)
        return "";
    const chunks = plugins.map((plugin) => {
        const skills = plugin.skills
            .map((skill) => `<plugin-skill name="${skill.name}">\n${skill.body.trim()}\n</plugin-skill>`)
            .join("\n\n");
        return `<plugin name="${plugin.name}">\n${plugin.body.trim()}\n${skills ? `\n\n${skills}` : ""}\n</plugin>`;
    });
    return [
        "",
        "## Active plugins",
        "The following plugins are always-active behavior packs. Follow them when relevant:",
        "",
        chunks.join("\n\n"),
    ].join("\n");
}
function loadPlugin(path, fallbackName) {
    const pluginMd = firstExisting([join(path, "PLUGIN.md"), join(path, "README.md")]);
    const skillsDir = join(path, "skills");
    const rootSkill = join(path, "SKILL.md");
    const skills = [];
    if (existsSync(rootSkill))
        skills.push({ name: "root", body: readFileSync(rootSkill, "utf8") });
    if (existsSync(skillsDir)) {
        for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
            if (!entry.isDirectory())
                continue;
            const skillPath = join(skillsDir, entry.name, "SKILL.md");
            if (existsSync(skillPath))
                skills.push({ name: entry.name, body: readFileSync(skillPath, "utf8") });
        }
    }
    if (!pluginMd && skills.length === 0)
        return undefined;
    const body = pluginMd ? readFileSync(pluginMd, "utf8") : `Plugin ${fallbackName}`;
    return {
        name: fallbackName,
        description: firstParagraph(body) || `${fallbackName} plugin`,
        path,
        body,
        skills,
    };
}
function firstExisting(paths) {
    return paths.find((path) => existsSync(path));
}
function firstParagraph(markdown) {
    return markdown
        .split(/\n\s*\n/)
        .map((part) => part.replace(/^#+\s*/, "").trim())
        .find(Boolean);
}
function slugify(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "plugin";
}
