import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { redactSensitive, RULESET_VERSION } from "../agent/policy/sensitive.js";

export const RAW_OUTPUT_THRESHOLD_CHARS = 30_000;
export const RAW_FILE_MAX_CHARS = 1_000_000;
export const RAW_SESSION_MAX_CHARS = 50_000_000;

export interface CollectionMeta {
    rawRef?: string;
    outputChars: number;
    droppedChars: number;
    redacted: number;
    rulesetVersion: string;
    error?: "too_large" | "quota" | "write_failed";
}

export function sessionOutputId(sessionFile: string): string {
    return basename(sessionFile).replace(/[.]jsonl$/i, "");
}

function outputsDir(sessionFile: string): string {
    return join(dirname(sessionFile), "outputs", sessionOutputId(sessionFile));
}

function sessionRawBytes(sessionFile: string): number {
    const dir = outputsDir(sessionFile);
    if (!existsSync(dir))
        return 0;
    let total = 0;
    for (const name of readdirSync(dir)) {
        if (!name.endsWith(".txt"))
            continue;
        try {
            total += readFileSync(join(dir, name), "utf8").length;
        }
        catch {
            // best effort
        }
    }
    return total;
}

/** Persist the full tool output for a fact; redaction applies only to this file. */
export function saveRawOutput(sessionFile: string, seq: number, content: string, droppedChars = 0): CollectionMeta {
    const outputChars = content.length;
    const base: CollectionMeta = {
        outputChars,
        droppedChars,
        redacted: 0,
        rulesetVersion: RULESET_VERSION,
    };
    if (outputChars <= RAW_OUTPUT_THRESHOLD_CHARS)
        return base;
    if (outputChars > RAW_FILE_MAX_CHARS)
        return { ...base, droppedChars: outputChars, error: "too_large" };
    if (sessionRawBytes(sessionFile) + outputChars > RAW_SESSION_MAX_CHARS)
        return { ...base, droppedChars: outputChars, error: "quota" };
    const dir = outputsDir(sessionFile);
    try {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        const safe = redactSensitive(content);
        const file = join(dir, seq + ".txt");
        writeFileSync(file, safe.text, { encoding: "utf8", mode: 0o600 });
        writeFileSync(join(dir, seq + ".json"), JSON.stringify({
            version: 1,
            outputChars,
            redacted: safe.redacted,
            rulesetVersion: RULESET_VERSION,
        }), { encoding: "utf8", mode: 0o600 });
        return {
            ...base,
            rawRef: relative(dirname(sessionFile), file).replace(/\\/g, "/"),
            redacted: safe.redacted,
        };
    }
    catch {
        return { ...base, droppedChars: outputChars, error: "write_failed" };
    }
}

export function readRawOutput(sessionFile: string, rawRef: string): string | undefined {
    const root = dirname(sessionFile);
    const file = join(root, rawRef);
    const rel = relative(root, file).replace(/\\/g, "/");
    if (rel.startsWith("..") || rel.startsWith("/"))
        return undefined;
    try {
        return existsSync(file) ? readFileSync(file, "utf8") : undefined;
    }
    catch {
        return undefined;
    }
}

export function removeRawOutputsForSession(sessionFile: string): void {
    try {
        rmSync(outputsDir(sessionFile), { recursive: true, force: true });
    }
    catch {
        // best effort
    }
}
