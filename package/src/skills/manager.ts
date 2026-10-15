/**
 * Skill manager.
 *
 * Skills follow Anthropic's "Agent Skills" convention: a folder containing
 * a SKILL.md file plus optional resource files. FastCode supports three
 * install sources:
 *
 *   1. skills.sh / skillshub.wtf API (default registry)
 *      `/skills install pdf`               → resolves via the registry
 *      `/skills install owner/repo/skill`  → fetches raw SKILL.md
 *   2. Direct https URLs ending in SKILL.md.
 *   3. Local paths (just symlinks into ~/.fastcode/skills/).
 *
 * Installed skills can be enabled per-session and are then stitched into
 * the system prompt at chat time, exactly like Claude does internally.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync, mkdirSync, } from "node:fs";
import { join } from "node:path";
import { getPaths } from "../config/paths.js";
import { fetchJson } from "../lib/http.js";
import { parseSkill } from "./parser.js";
const DEFAULT_REGISTRY = "https://skillshub.wtf";
/** List skills currently installed under ~/.fastcode/skills. */
export function listInstalledSkills() {
    const { skills } = getPaths();
    if (!existsSync(skills))
        return [];
    const out = [];
    for (const dir of readdirSync(skills, { withFileTypes: true })) {
        if (!dir.isDirectory())
            continue;
        const folder = join(skills, dir.name);
        const md = join(folder, "SKILL.md");
        if (!existsSync(md))
            continue;
        const raw = readFileSync(md, "utf8");
        const parsed = parseSkill(raw, dir.name);
        const sourcePath = join(folder, ".fastcode-source");
        const source = existsSync(sourcePath)
            ? readFileSync(sourcePath, "utf8").trim()
            : "local";
        out.push({
            name: parsed.name || dir.name,
            description: parsed.description,
            source,
            path: folder,
            body: parsed.body,
        });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}
/** Look up a skill by name (matches folder name OR frontmatter name). */
export function getSkill(name) {
    return listInstalledSkills().find((s) => s.name === name || basename(s.path) === name);
}
/** Install a skill. Returns the parsed manifest on success. */
export async function installSkill(spec, opts: any = {}) {
    const { skills } = getPaths();
    const registry = (opts.registry ?? DEFAULT_REGISTRY).replace(/\/+$/, "");
    let parsed;
    let source;
    let folderName;
    if (spec.startsWith("http://") || spec.startsWith("https://")) {
        const body = await fetchText(spec);
        parsed = parseSkill(body, slugify(spec));
        source = spec;
        folderName = slugify(parsed.name || slugify(spec));
    }
    else if (looksLikeRepoPath(spec)) {
        // owner/repo or owner/repo/skill — fetch via registry's raw endpoint.
        const url = `${registry}/${spec}?format=md`;
        const body = await fetchText(url);
        parsed = parseSkill(body, parts(spec).pop() ?? spec);
        source = url;
        folderName = slugify(parsed.name || parts(spec).pop() || spec);
    }
    else {
        // Single-token name → search the registry.
        const hits = await searchRegistry(spec, registry);
        const hit = hits[0];
        if (!hit)
            throw new Error(`No skill found for "${spec}" in ${registry}`);
        const url = hit.fetchUrl ?? `${registry}/${hit.slug}?format=md`;
        const body = await fetchText(url);
        parsed = parseSkill(body, hit.name);
        source = url;
        folderName = slugify(parsed.name || hit.name);
    }
    const targetDir = join(skills, folderName);
    if (existsSync(targetDir) && !opts.force) {
        throw new Error(`Skill "${folderName}" is already installed. Use --force to overwrite.`);
    }
    if (existsSync(targetDir))
        rmSync(targetDir, { recursive: true, force: true });
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, "SKILL.md"), reassemble(parsed));
    writeFileSync(join(targetDir, ".fastcode-source"), source);
    return {
        name: parsed.name || folderName,
        description: parsed.description,
        source,
        path: targetDir,
        body: parsed.body,
    };
}
/** Remove an installed skill by name or folder. */
export function uninstallSkill(name) {
    const { skills } = getPaths();
    const candidates = readdirSync(skills, { withFileTypes: true });
    for (const dir of candidates) {
        if (!dir.isDirectory())
            continue;
        if (dir.name !== name) {
            // Also match by frontmatter name.
            const md = join(skills, dir.name, "SKILL.md");
            if (!existsSync(md))
                continue;
            const parsed = parseSkill(readFileSync(md, "utf8"), dir.name);
            if (parsed.name !== name)
                continue;
        }
        rmSync(join(skills, dir.name), { recursive: true, force: true });
        return true;
    }
    return false;
}
/** Search the registry for skills matching a query. */
export async function searchRegistry(query, registry = DEFAULT_REGISTRY) {
    const base = registry.replace(/\/+$/, "");
    try {
        const json = await fetchJson(`${base}/api/v1/skills/search?q=${encodeURIComponent(query)}`);
        return json.data ?? [];
    }
    catch {
        return [];
    }
}
/** Compose the system-prompt addendum for a list of enabled skill names. */
export function buildSkillsPrompt(enabled) {
    if (enabled.length === 0)
        return "";
    const installed = listInstalledSkills();
    const chunks = [];
    for (const name of enabled) {
        const skill = installed.find((s) => s.name === name || basename(s.path) === name);
        if (!skill)
            continue;
        chunks.push(`<skill name="${skill.name}">\n${skill.body.trim()}\n</skill>`);
    }
    if (chunks.length === 0)
        return "";
    return [
        "",
        "## Active skills",
        "The following skills are loaded for this session. Follow their instructions when relevant:",
        "",
        chunks.join("\n\n"),
    ].join("\n");
}
// ---------- helpers ----------
async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`Fetch ${url} failed: ${res.status} ${res.statusText}`);
    return await res.text();
}
function reassemble(parsed) {
    const fmEntries = Object.entries(parsed.frontmatter);
    if (fmEntries.length === 0 && parsed.name && parsed.description) {
        return [
            "---",
            `name: ${parsed.name}`,
            `description: ${parsed.description}`,
            "---",
            "",
            parsed.body.trim(),
            "",
        ].join("\n");
    }
    if (fmEntries.length === 0)
        return parsed.body;
    const fmLines = fmEntries.map(([k, v]) => `${k}: ${v}`);
    return ["---", ...fmLines, "---", "", parsed.body.trim(), ""].join("\n");
}
function slugify(s) {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64) || "skill";
}
function looksLikeRepoPath(spec) {
    return /^[\w-]+\/[\w.-]+(\/[\w.-]+)?$/.test(spec) && !spec.startsWith("/");
}
function parts(spec) {
    return spec.split("/").filter(Boolean);
}
function basename(p) {
    const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    return i === -1 ? p : p.slice(i + 1);
}
