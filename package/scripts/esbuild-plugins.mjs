/**
 * esbuild plugins shared by scripts/build.mjs and the banner self-test.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Some dependencies are CommonJS (e.g. cfonts -> supports-color) and call
// `require('os')` / `require('node:...')` at runtime. In an ESM bundle esbuild
// replaces those with a `__require` shim that throws "Dynamic require ... is not
// supported". Exposing a real `require` (via createRequire) makes that shim work,
// and also keeps the shebang on line 1.
export const bannerJs = [
  "#!/usr/bin/env node",
  'import { createRequire as __createRequire } from "node:module";',
  "const require = __createRequire(import.meta.url);",
].join("\n");

// ink lazily pulls in `react-devtools-core` (a dev-only optional dep) from
// devtools.js. We never enable devtools, so stub it to keep the bundle
// fully self-contained.
export const stubOptionalDeps = {
  name: "stub-optional-deps",
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, (args) => ({
      path: args.path,
      namespace: "stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents:
        "const noop=()=>{};export const connectToDevTools=noop;export default{connectToDevTools:noop};",
      loader: "js",
    }));
  },
};

// cfonts (used by ink-big-text for the startup wordmark) loads its font via a
// dynamic `require(path.normalize('../fonts/<name>.json'))` inside a try/catch.
// esbuild can't follow that, so the require fails at runtime, GetFont() returns
// false and the big "FastCode" banner silently disappears. Inline every font as
// a static map so the banner renders from the bundle.
export function createInlineCfontsFonts(pkgRoot) {
  return {
    name: "inline-cfonts-fonts",
    setup(build) {
      build.onLoad({ filter: /cfonts[\\/]lib[\\/]GetFont\.js$/ }, (args) => {
        let src = readFileSync(args.path, "utf8");
        const before = src;
        src = src.replace(
          /require\(path\.normalize\(`\.\.\/fonts\/\$\{font\}\.json`\)\)/,
          "__CFONTS_FONTS__[font]"
        );
        if (src === before) {
          throw new Error(
            "inline-cfonts-fonts: cfonts font-loader pattern not found (cfonts changed?)"
          );
        }
        return {
          contents: `import __CFONTS_FONTS__ from "cfonts-fonts";\n${src}`,
          loader: "js",
        };
      });

      build.onResolve({ filter: /^cfonts-fonts$/ }, () => ({
        path: "cfonts-fonts",
        namespace: "cfonts-fonts",
      }));

      build.onLoad({ filter: /.*/, namespace: "cfonts-fonts" }, () => {
        const fontsDir = join(pkgRoot, "node_modules", "cfonts", "fonts");
        const entries = readdirSync(fontsDir)
          .filter((f) => f.endsWith(".json"))
          .map(
            (f) =>
              `${JSON.stringify(f.replace(/\.json$/, ""))}: ${readFileSync(join(fontsDir, f), "utf8")}`
          );
        return { contents: `export default {${entries.join(",")}};`, loader: "js" };
      });
    },
  };
}
