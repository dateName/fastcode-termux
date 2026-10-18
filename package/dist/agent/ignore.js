/**
 * Ignore rules for directory walks and reads.
 *
 * Defaults cover the usual dependency/build folders. Users can add more with
 * `.fastcodeignore` in the project root, using a gitignore-like syntax:
 *
 *   node_modules/     # trailing slash = directories only
 *   *.log             # basename at any depth
 *   /secrets.txt      # anchored to the project root
 *   !important.log    # re-include (last matching rule wins)
 */
import { readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
const DEFAULT_NAMES = new Set([
    "node_modules",
    ".git",
    ".hg",
    ".svn",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    ".output",
    ".turbo",
    ".parcel-cache",
    ".cache",
    "coverage",
    ".nyc_output",
    "__pycache__",
    ".venv",
    "venv",
    "target",
    ".gradle",
    ".idea",
]);
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|bmp|tiff?|pdf|zip|gz|tgz|bz2|xz|7z|rar|exe|dll|so|dylib|bin|wasm|mp3|mp4|mov|avi|mkv|wav|flac|ttf|otf|woff2?|eot|class|jar|apk|ipa|sqlite|db|lock)$/i;
export function isBinaryName(name) {
    return BINARY_EXT.test(name);
}
export function createIgnore(root) {
    const rules = loadRules(root);
    return {
        ignored(name, fullPath, isDir) {
            if (DEFAULT_NAMES.has(name))
                return true;
            if (rules.length === 0)
                return false;
            const rel = relative(root, fullPath).split(sep).join("/");
            let ignored = false;
            for (const rule of rules) {
                if (rule.dirOnly && !isDir)
                    continue;
                if (rule.regex.test(rel) || rule.regex.test(name))
                    ignored = !rule.negate;
            }
            return ignored;
        },
        isBinary(name) {
            return BINARY_EXT.test(name);
        },
    };
}
function loadRules(root) {
    const file = join(root, ".fastcodeignore");
    let text = "";
    try {
        const info = statSync(file);
        if (!info.isFile())
            return [];
        text = readFileSync(file, "utf8");
    }
    catch {
        return [];
    }
    const rules = [];
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith("#"))
            continue;
        const negate = line.startsWith("!");
        const body = negate ? line.slice(1).trim() : line;
        if (!body)
            continue;
        const dirOnly = body.endsWith("/");
        const pattern = dirOnly ? body.slice(0, -1) : body;
        const anchored = pattern.startsWith("/");
        const glob = anchored ? pattern.slice(1) : pattern;
        try {
            rules.push({
                regex: globToRegExp(glob, anchored),
                negate,
                dirOnly,
            });
        }
        catch {
            // A bad pattern must not disable the whole ignore file.
        }
    }
    return rules;
}
function globToRegExp(glob, anchored) {
    let source = "";
    for (let i = 0; i < glob.length; i += 1) {
        const char = glob[i];
        if (char === "*") {
            if (glob[i + 1] === "*") {
                source += ".*";
                i += 1;
                if (glob[i + 1] === "/")
                    i += 1;
            }
            else {
                source += "[^/]*";
            }
        }
        else if (char === "?") {
            source += "[^/]";
        }
        else {
            source += escapeRegExp(char);
        }
    }
    // Unanchored patterns match a basename at any depth.
    return new RegExp("^" + (anchored ? "" : "(?:.*/)?") + source + "$");
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
