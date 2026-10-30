/**
 * Trimmed highlight.js registry.
 *
 * cli-highlight imports the full `highlight.js` package, which registers every
 * language and adds roughly a megabyte of language definitions to the bundle
 * for a TUI that mostly renders JS/TS/JSON/sh/Python. The esbuild plugin in
 * scripts/esbuild-plugins.mjs aliases the bare `highlight.js` import to this
 * module so only the common set below is bundled.
 *
 * Unknown languages still work: cli-highlight throws, marked-terminal catches
 * and renders the fence as plain styled text. `renderMarkdown` adds a short
 * dimmed hint instead of failing or blanking the message.
 */
import hljs from "highlight.js/lib/core.js";
import javascript from "highlight.js/lib/languages/javascript.js";
import typescript from "highlight.js/lib/languages/typescript.js";
import json from "highlight.js/lib/languages/json.js";
import bash from "highlight.js/lib/languages/bash.js";
import python from "highlight.js/lib/languages/python.js";
import go from "highlight.js/lib/languages/go.js";
import rust from "highlight.js/lib/languages/rust.js";
import java from "highlight.js/lib/languages/java.js";
import c from "highlight.js/lib/languages/c.js";
import cpp from "highlight.js/lib/languages/cpp.js";
import csharp from "highlight.js/lib/languages/csharp.js";
import css from "highlight.js/lib/languages/css.js";
import xml from "highlight.js/lib/languages/xml.js";
import yaml from "highlight.js/lib/languages/yaml.js";
import markdown from "highlight.js/lib/languages/markdown.js";
import sql from "highlight.js/lib/languages/sql.js";
import diff from "highlight.js/lib/languages/diff.js";
import dockerfile from "highlight.js/lib/languages/dockerfile.js";
import powershell from "highlight.js/lib/languages/powershell.js";
import kotlin from "highlight.js/lib/languages/kotlin.js";
import swift from "highlight.js/lib/languages/swift.js";
import ruby from "highlight.js/lib/languages/ruby.js";
import php from "highlight.js/lib/languages/php.js";
import lua from "highlight.js/lib/languages/lua.js";
import r from "highlight.js/lib/languages/r.js";
import scala from "highlight.js/lib/languages/scala.js";
import ini from "highlight.js/lib/languages/ini.js";
import makefile from "highlight.js/lib/languages/makefile.js";
import plaintext from "highlight.js/lib/languages/plaintext.js";
const LANGUAGES = {
    javascript,
    typescript,
    json,
    bash,
    python,
    go,
    rust,
    java,
    c,
    cpp,
    csharp,
    css,
    xml,
    yaml,
    markdown,
    sql,
    diff,
    dockerfile,
    powershell,
    kotlin,
    swift,
    ruby,
    php,
    lua,
    r,
    scala,
    ini,
    makefile,
    plaintext,
};
for (const [name, definition] of Object.entries(LANGUAGES))
    hljs.registerLanguage(name, definition);
export const COMMON_HIGHLIGHT_LANGUAGES = Object.keys(LANGUAGES);
export function supportsHighlightLanguage(language) {
    if (!language)
        return true;
    const name = language.trim().toLowerCase().split(/\s+/)[0] ?? "";
    return Boolean(name) && Boolean(hljs.getLanguage(name));
}
export const highlight = hljs.highlight.bind(hljs);
export const highlightAuto = hljs.highlightAuto.bind(hljs);
export const listLanguages = hljs.listLanguages.bind(hljs);
export const getLanguage = hljs.getLanguage.bind(hljs);
export default hljs;
