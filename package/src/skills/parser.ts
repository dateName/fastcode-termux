/**
 * SKILL.md parser. Skills follow Anthropic's Agent Skills convention:
 *
 *   ---
 *   name: my-skill
 *   description: ...
 *   ---
 *   <markdown body>
 *
 * We accept both `---` and `+++` fences and tolerate missing frontmatter
 * (treating the first H1 + paragraph as a fallback name/description).
 */
export function parseSkill(source, fallbackName) {
    const fmMatch = source.match(/^(?:---|\+\+\+)\s*\n([\s\S]*?)\n(?:---|\+\+\+)\s*\n?/);
    let frontmatter = {};
    let body = source;
    if (fmMatch) {
        frontmatter = parseFrontmatter(fmMatch[1] ?? "");
        body = source.slice(fmMatch[0].length).trimStart();
    }
    const name = (frontmatter["name"] ?? fallbackName).trim();
    const description = (frontmatter["description"] ??
        extractFirstParagraph(body) ??
        "").trim();
    return { name, description, body, frontmatter };
}
function parseFrontmatter(yaml) {
    // Tiny YAML-ish parser: only handles `key: value` lines, which is what
    // SKILL.md frontmatter uses in practice. This avoids pulling in a YAML lib.
    const out = {};
    for (const lineRaw of yaml.split("\n")) {
        const line = lineRaw.trim();
        if (!line || line.startsWith("#"))
            continue;
        const colon = line.indexOf(":");
        if (colon === -1)
            continue;
        const key = line.slice(0, colon).trim();
        let value = line.slice(colon + 1).trim();
        if ((value.startsWith("\"") && value.endsWith("\"")) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    }
    return out;
}
function extractFirstParagraph(body) {
    const lines = body.split("\n");
    let buf = [];
    for (const line of lines) {
        if (line.startsWith("#")) {
            if (buf.length)
                break;
            continue;
        }
        if (!line.trim()) {
            if (buf.length)
                break;
            continue;
        }
        buf.push(line.trim());
    }
    return buf.length ? buf.join(" ") : undefined;
}
