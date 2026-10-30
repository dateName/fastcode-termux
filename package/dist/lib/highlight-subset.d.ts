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
export declare const COMMON_HIGHLIGHT_LANGUAGES: string[];
export declare function supportsHighlightLanguage(language: string | undefined): boolean;
export declare const highlight: any;
export declare const highlightAuto: any;
export declare const listLanguages: any;
export declare const getLanguage: any;
export default hljs;
