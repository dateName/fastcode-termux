export declare const RAW_OUTPUT_THRESHOLD_CHARS = 30000;
export declare const RAW_FILE_MAX_CHARS = 1000000;
export declare const RAW_SESSION_MAX_CHARS = 50000000;
export interface CollectionMeta {
    rawRef?: string;
    outputChars: number;
    droppedChars: number;
    redacted: number;
    rulesetVersion: string;
    error?: "too_large" | "quota" | "write_failed";
}
export declare function sessionOutputId(sessionFile: string): string;
/** Persist the full tool output for a fact; redaction applies only to this file. */
export declare function saveRawOutput(sessionFile: string, seq: number, content: string): CollectionMeta;
export declare function readRawOutput(sessionFile: string, rawRef: string): string | undefined;
export declare function removeRawOutputsForSession(sessionFile: string): void;
