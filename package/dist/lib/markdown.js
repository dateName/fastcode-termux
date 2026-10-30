/**
 * Markdown → ANSI rendering for terminal output.
 *
 * We use marked + marked-terminal because it gives us proper code-fence
 * syntax highlighting (via cli-highlight) without us hand-rolling a
 * markdown parser. The result is a fully-formatted ANSI string we can
 * print directly inside an Ink <Text>.
 */
import chalk from "chalk";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { supportsHighlightLanguage } from "./highlight-subset.js";
let configured = false;
function configure() {
    if (configured)
        return;
    marked.use(markedTerminal({
        reflowText: false,
        tab: 2,
        // marked-terminal calls this only when highlighting fails; keep the
        // cold-language fallback as plain text instead of colored source.
        code: (text) => text,
    }));
    configured = true;
}
function unsupportedFenceLanguages(md) {
    const missing = new Set();
    for (const match of md.matchAll(/(?:^|\n)\s*(?:`{3,}|~{3,})([^\n]*)/g)) {
        const info = (match[1] ?? "").trim();
        if (!info)
            continue;
        const language = info.split(/\s+/)[0] ?? "";
        if (language && !supportsHighlightLanguage(language))
            missing.add(language);
    }
    return Array.from(missing);
}
export function renderMarkdown(md) {
    configure();
    try {
        const out = marked.parse(md).replace(/\s+$/, "");
        const missing = unsupportedFenceLanguages(String(md));
        if (missing.length === 0)
            return out;
        return out + "\n\n" + chalk.dim(`[fastcode] no syntax highlighting for ${missing.join(", ")}; rendered as plain text.`);
    }
    catch {
        return md;
    }
}
