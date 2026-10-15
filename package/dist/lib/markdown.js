/**
 * Markdown → ANSI rendering for terminal output.
 *
 * We use marked + marked-terminal because it gives us proper code-fence
 * syntax highlighting (via cli-highlight) without us hand-rolling a
 * markdown parser. The result is a fully-formatted ANSI string we can
 * print directly inside an Ink <Text>.
 */
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
let configured = false;
function configure() {
    if (configured)
        return;
    marked.use(markedTerminal({
        reflowText: false,
        tab: 2,
    }));
    configured = true;
}
export function renderMarkdown(md) {
    configure();
    try {
        const out = marked.parse(md);
        // marked-terminal sometimes appends a stray trailing newline; trim only
        // trailing whitespace so we don't lose meaningful blank lines.
        return out.replace(/\s+$/, "");
    }
    catch {
        return md;
    }
}
