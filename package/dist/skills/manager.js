/**
 * Skill manager.
 *
 * Skills follow Anthropic's "Agent Skills" convention: a folder containing
 * a SKILL.md file plus optional resource files. FastCode supports three
 * install sources:
 *
 *   1. A registry configured via FASTCODE_SKILLS_REGISTRY or skillsRegistry
 *      `/skills install pdf`               → resolves via the configured registry
 *      `/skills install owner/repo/skill`  → fetches raw SKILL.md from the registry
 *   2. Direct https URLs ending in SKILL.md (no registry required).
 *   3. Local paths (just symlinks into ~/.fastcode/skills/).
 *
 * Installed skills can be enabled per-session and are then stitched into
 * the system prompt at chat time, exactly like Claude does internally.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync, mkdirSync, } from "node:fs";
import { join } from "node:path";
import { getPaths } from "../config/paths.js";
import { invalidateConfigCache } from "../config/store.js";
import { fetchJson } from "../lib/http.js";
import { parseSkill } from "./parser.js";
const SOURCE_FILE = ".fastcode-source";
const INTEGRITY_VERSION = 1;
const REGISTRY_REQUIRED = "No skills registry configured. Set one with `/skills registry <url>` or FASTCODE_SKILLS_REGISTRY.";
/**
 * Pick the skills registry without treating an empty environment variable as
 * "configured". `??` would keep `""` and make env overrides silently break;
 * explicit null/empty checks keep `""` and `" "` on the config path. There is
 * intentionally no built-in default registry.
 */
export function resolveRegistry(envValue, configValue) {
    const env = typeof envValue === "string" && envValue.trim() ? envValue.trim() : "";
    const configured = typeof configValue === "string" && configValue.trim() ? configValue.trim() : "";
    return (env || configured).replace(/\/+$/, "");
}
function requireRegistry(registry) {
    if (!registry)
        throw new Error(REGISTRY_REQUIRED);
    return registry;
}
export function hashSkillDirectory(folder) {
    const entries = skillFiles(folder).sort();
    return createHash("sha256").update(entries.join("\n")).digest("hex");
}
function skillFiles(folder, prefix = "") {
    const out = [];
    let items;
    try {
        items = readdirSync(folder, { withFileTypes: true });
    }
    catch {
        return out;
    }
    for (const item of items) {
        if (item.name === SOURCE_FILE)
            continue;
        const full = join(folder, item.name);
        const rel = prefix ? prefix + "/" + item.name : item.name;
        if (item.isDirectory()) {
            out.push(...skillFiles(full, rel));
            continue;
        }
        if (!item.isFile())
            continue;
        const digest = createHash("sha256").update(readFileSync(full)).digest("hex");
        out.push(rel + "\0" + digest);
    }
    return out;
}
function readSourceMeta(folder) {
    const sourcePath = join(folder, SOURCE_FILE);
    if (!existsSync(sourcePath))
        return { source: "local", legacy: true };
    const raw = readFileSync(sourcePath, "utf8").trim();
    if (raw.startsWith("{")) {
        try {
            const parsed = JSON.parse(raw);
            return {
                source: typeof parsed.source === "string" ? parsed.source : "local",
                sha256: typeof parsed.sha256 === "string" ? parsed.sha256 : undefined,
                legacy: typeof parsed.sha256 !== "string",
            };
        }
        catch {
            // Fall through and treat the file as a legacy plain-text source.
        }
    }
    return { source: raw || "local", legacy: true };
}
function writeSourceMeta(folder, source) {
    const sha256 = hashSkillDirectory(folder);
    const payload = {
        version: INTEGRITY_VERSION,
        algorithm: "sha256",
        source,
        sha256,
    };
    writeFileSync(join(folder, SOURCE_FILE), JSON.stringify(payload, null, 2));
    return sha256;
}
export function rebaselineSkills(names) {
    const installed = listInstalledSkills();
    const wanted = names && names.length > 0 ? new Set(names) : undefined;
    const results = [];
    let changed = false;
    for (const skill of installed) {
        if (wanted && !wanted.has(skill.name) && !wanted.has(basename(skill.path)))
            continue;
        try {
            writeSourceMeta(skill.path, skill.source === "local" ? "local" : skill.source);
            results.push({ name: skill.name, ok: true });
            changed = true;
        }
        catch (err) {
            results.push({ name: skill.name, ok: false, warning: err?.message ?? String(err) });
        }
    }
    if (changed)
        invalidateConfigCache();
    return results;
}
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
        const meta = readSourceMeta(folder);
        const actualHash = hashSkillDirectory(folder);
        const integrity = !meta.sha256
            ? "unverified"
            : actualHash === meta.sha256 ? "ok" : "drift";
        out.push({
            name: parsed.name || dir.name,
            description: parsed.description,
            source: meta.source,
            path: folder,
            body: parsed.body,
            integrity,
            sha256: actualHash,
            lockedHash: meta.sha256,
        });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}
/** Look up a skill by name (matches folder name OR frontmatter name). */
export function getSkill(name) {
    return listInstalledSkills().find((s) => s.name === name || basename(s.path) === name);
}
/** Install a skill. Returns the parsed manifest on success. */
export async function installSkill(spec, opts = {}) {
    const { skills } = getPaths();
    const registry = resolveRegistry(process.env["FASTCODE_SKILLS_REGISTRY"], opts.registry);
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
        const base = requireRegistry(registry);
        const url = `${base}/${spec}?format=md`;
        const body = await fetchText(url);
        parsed = parseSkill(body, parts(spec).pop() ?? spec);
        source = url;
        folderName = slugify(parsed.name || parts(spec).pop() || spec);
    }
    else {
        // Single-token name → search the registry.
        const base = requireRegistry(registry);
        const hits = await searchRegistry(spec, base);
        const hit = hits[0];
        if (!hit)
            throw new Error(`No skill found for "${spec}" in ${base}`);
        const url = hit.fetchUrl ?? `${base}/${hit.slug}?format=md`;
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
    writeSourceMeta(targetDir, source);
    return {
        name: parsed.name || folderName,
        description: parsed.description,
        source,
        path: targetDir,
        body: parsed.body,
        integrity: "ok",
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
export async function searchRegistry(query, registry) {
    const base = resolveRegistry(process.env["FASTCODE_SKILLS_REGISTRY"], registry);
    if (!base)
        return [];
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
        if (skill.integrity !== "ok") {
            const reason = skill.integrity === "drift"
                ? "content drift detected"
                : "no integrity baseline (legacy install)";
            process.stderr.write(`skill ${skill.name} ${reason}; disabled. Run /skills verify ${skill.name} --confirm to re-baseline.\n`);
            continue;
        }
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
