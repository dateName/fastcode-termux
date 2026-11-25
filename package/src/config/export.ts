import { existsSync, readFileSync } from "node:fs";

export interface ConfigExportOptions {
    withKeys?: boolean;
}

function readJson(file: string): any {
    try {
        return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
    }
    catch {
        return undefined;
    }
}

function redactAuth(auth: any): any {
    if (!auth || typeof auth !== "object")
        return auth;
    const clone = JSON.parse(JSON.stringify(auth));
    for (const entry of Object.values(clone.keys ?? {}) as any[]) {
        if (entry && typeof entry === "object")
            entry.key = "[REDACTED]";
    }
    if (clone.legacy && typeof clone.legacy === "object") {
        for (const key of Object.keys(clone.legacy))
            clone.legacy[key] = "[REDACTED]";
    }
    return clone;
}

/** Export only user config files; session raw outputs are never included. */
export function buildConfigExport(paths: { config: string; auth: string; trust: string; root: string }, options: ConfigExportOptions = {}): any {
    const auth = readJson(paths.auth);
    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        config: readJson(paths.config),
        auth: options.withKeys ? auth : redactAuth(auth),
        trusted: readJson(paths.trust),
        modelMeta: readJson(paths.root + "/model-meta.json"),
        excluded: ["sessions/outputs/"],
    };
}
