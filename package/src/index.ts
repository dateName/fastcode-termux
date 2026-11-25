/**
 * FastCode entrypoint.
 *
 * Parses CLI args, then either runs a one-shot subcommand or boots the
 * Ink-based TUI. We keep this file tiny so the slow imports (Ink, React)
 * are not loaded for `fastcode skills list`.
 */
import { parseCli } from "./cli-main.js";
import { installProcessGuards } from "./lib/lifecycle.js";
async function main() {
    installProcessGuards();
    const cli = await parseCli();
    if (cli.done)
        return;
    if (cli.ui === "json") {
        if (!cli.prompt) {
            console.error("--ui json requires a prompt: fastcode --ui json \"<prompt>\"");
            process.exit(1);
        }
        const { runHeadless } = await import("./headless.js");
        await runHeadless({ prompt: cli.prompt, ui: "json", resume: cli.resume, longRun: cli.longRun });
        return;
    }
    if (!process.stdout.isTTY) {
        if (cli.ui === "plain" && cli.prompt) {
            const { runHeadless } = await import("./headless.js");
            await runHeadless({ prompt: cli.prompt, ui: "plain", resume: cli.resume, longRun: cli.longRun });
            return;
        }
        console.error("FastCode TUI requires a TTY. Use `fastcode --ui plain|json \"<prompt>\"` for pipe mode.");
        process.exit(1);
    }
    // Lazy-load Ink so subcommands don't pay the React boot cost.
    const [{ render }, React, { App }] = await Promise.all([
        import("ink"),
        import("react"),
        import("./app.js"),
    ]);
    // React.createElement avoids needing a separate .tsx loader for this file.
    // exitOnCtrlC: false lets the app own Ctrl+C so the documented
    // "press Ctrl+C twice to quit" behavior actually works.
    render(React.createElement(App, { initialPrompt: cli.prompt, resume: cli.resume, ui: cli.ui ?? "tty", longRun: cli.longRun }), { exitOnCtrlC: false });
}
main().catch((err) => {
    const debug = ["1", "true", "yes", "on"].includes((process.env["FASTCODE_DEBUG"] ?? "").trim().toLowerCase());
    // Avoid dumping the minified bundle stack (with dist paths) on startup
    // errors; FASTCODE_DEBUG restores the full stack for support.
    console.error(debug && err instanceof Error && err.stack ? err.stack : `[fastcode] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
});
