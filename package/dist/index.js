/**
 * FastCode entrypoint.
 *
 * Parses CLI args, then either runs a one-shot subcommand or boots the
 * Ink-based TUI. We keep this file tiny so the slow imports (Ink, React)
 * are not loaded for `fastcode skills list`.
 */
import { parseCli } from "./cli.js";
async function main() {
    const cli = await parseCli();
    if (cli.done)
        return;
    if (!process.stdout.isTTY) {
        console.error("FastCode TUI requires a TTY. Pipe-mode prompts aren't supported yet — try `fastcode \"<prompt>\"` from a real terminal.");
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
    render(React.createElement(App, { initialPrompt: cli.prompt, resume: cli.resume }), { exitOnCtrlC: false });
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
