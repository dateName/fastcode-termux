import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, } from "node:fs";
import { basename, join, resolve } from "node:path";
import { getPaths } from "../config/paths.js";
import { isTrusted } from "../config/trust.js";
function projectPluginsDir(cwd: string): string {
    return join(cwd, ".fastcode", "plugins");
}
function loadPluginsFrom(dir: string) {
    if (!existsSync(dir))
        return [];
    return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => loadPlugin(join(dir, entry.name), entry.name))
        .filter((plugin) => plugin !== undefined);
}
export function listInstalledPlugins(cwd = process.cwd()) {
    const byName = new Map();
    const dirs = [getPaths().plugins];
    if (isTrusted(cwd))
        dirs.push(projectPluginsDir(cwd));
    for (const dir of dirs) {
        for (const plugin of loadPluginsFrom(dir))
            byName.set(plugin.name, plugin);
    }
    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}
export function getPlugin(name, cwd = process.cwd()) {
    return listInstalledPlugins(cwd).find((p) => p.name === name || basename(p.path) === name);
}
export function importPlugin(source, name, cwd = process.cwd()) {
    const src = resolve(source);
    if (!existsSync(src))
        throw new Error(`Plugin source does not exist: ${source}`);
    if (!statSync(src).isDirectory())
        throw new Error("Plugin source must be a directory");
    const fallback = slugify(name ?? basename(src));
    const manifest = readManifest(src, fallback);
    const folder = slugify(name ?? manifest.name);
    const base = manifest.scope === "project" ? projectPluginsDir(cwd) : getPaths().plugins;
    const target = join(base, folder);
    if (existsSync(target))
        rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    cpSync(src, target, { recursive: true });
    writeFileSync(join(target, ".fastcode-source"), src);
    const loaded = loadPlugin(target, folder);
    if (!loaded) {
        rmSync(target, { recursive: true, force: true });
        throw new Error("Plugin must include PLUGIN.md, README.md, or at least one SKILL.md");
    }
    if (loaded.unsupported.length > 0) {
        rmSync(target, { recursive: true, force: true });
        throw new Error(`Plugin declares unsupported capabilities: ${loaded.unsupported.join(", ")} (only prompt/skills are supported)`);
    }
    return loaded;
}
export function removePlugin(name, cwd = process.cwd()) {
    const plugin = getPlugin(name, cwd);
    if (!plugin)
        return false;
    rmSync(plugin.path, { recursive: true, force: true });
    return true;
}
export function buildPluginsPrompt(enabled, cwd = process.cwd()) {
    if (enabled.length === 0)
        return "";
    const plugins = enabled.map((name) => getPlugin(name, cwd)).filter((p) => p !== undefined && (p.unsupported?.length ?? 0) === 0);
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
const SUPPORTED_PLUGIN_CAPABILITIES = new Set(["prompt", "skills"]);

function readManifest(path, fallbackName) {
    const file = join(path, "plugin.json");
    if (!existsSync(file))
        return { name: fallbackName, capabilities: [], scope: "global", unsupported: [] };
    try {
        const raw = JSON.parse(readFileSync(file, "utf8"));
        const declared = Array.isArray(raw?.capabilities)
            ? raw.capabilities.filter((entry) => typeof entry === "string" && entry.trim())
            : [];
        return {
            name: typeof raw?.name === "string" && raw.name.trim() ? slugify(raw.name) : fallbackName,
            version: typeof raw?.version === "string" ? raw.version : undefined,
            description: typeof raw?.description === "string" ? raw.description : undefined,
            capabilities: declared,
            scope: raw?.scope === "project" ? "project" : "global",
            unsupported: declared.filter((capability) => !SUPPORTED_PLUGIN_CAPABILITIES.has(capability)),
        };
    }
    catch {
        return { name: fallbackName, capabilities: [], scope: "global", unsupported: [] };
    }
}

function loadPlugin(path, fallbackName) {
    const manifest = readManifest(path, fallbackName);
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
    const inferred = [
        ...(pluginMd ? ["prompt"] : []),
        ...(skills.length > 0 ? ["skills"] : []),
    ];
    const capabilities = manifest.capabilities.length > 0 ? manifest.capabilities : inferred;
    return {
        name: manifest.name,
        description: manifest.description || firstParagraph(body) || `${fallbackName} plugin`,
        path,
        body,
        skills,
        version: manifest.version,
        capabilities,
        scope: manifest.scope,
        unsupported: capabilities.filter((capability) => !SUPPORTED_PLUGIN_CAPABILITIES.has(capability)),
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
