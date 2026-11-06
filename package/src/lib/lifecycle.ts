/**
 * Process-level shutdown guards.
 *
 * The TUI already calls shutdownShells() from its React cleanup, but fatal
 * errors and SIGTERM/SIGHUP can bypass that path. These guards are best-effort
 * and idempotent; they do not turn FastCode into a kernel-level sandbox.
 */
import { shutdownShells } from "../agent/shell-session.js";

let installed = false;
let cleaned = false;

export function cleanupProcesses(): void {
    if (cleaned)
        return;
    cleaned = true;
    try {
        shutdownShells();
    }
    catch {
        // Best effort: never mask the original failure.
    }
}

export interface ProcessGuardOptions {
    onFatal?: (error: unknown) => void;
}

export function installProcessGuards(options: ProcessGuardOptions = {}): () => void {
    if (installed)
        return () => undefined;
    installed = true;
    const onSignal = (signal: NodeJS.Signals) => {
        process.stderr.write(`[fastcode] ${signal} received; shutting down.\n`);
        cleanupProcesses();
        process.exit(signal === "SIGINT" ? 130 : 143);
    };
    const onFatal = (error: unknown) => {
        const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
        process.stderr.write(`[fastcode] fatal: ${detail}\n`);
        cleanupProcesses();
        options.onFatal?.(error);
        process.exit(1);
    };
    const signals: NodeJS.Signals[] = ["SIGTERM", "SIGHUP"];
    for (const signal of signals) {
        try {
            process.on(signal, onSignal);
        }
        catch {
            // Some platforms do not expose every signal.
        }
    }
    process.on("uncaughtException", onFatal);
    process.on("unhandledRejection", onFatal);
    return () => {
        for (const signal of signals) {
            try {
                process.removeListener(signal, onSignal);
            }
            catch {
                // Ignore unsupported signals.
            }
        }
        process.removeListener("uncaughtException", onFatal);
        process.removeListener("unhandledRejection", onFatal);
        installed = false;
    };
}
