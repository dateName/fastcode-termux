import type { ChatMessage } from "../types.js";
import { type ActiveFile } from "./log.js";
export interface SessionMeta {
    cwd: string;
    providerId: string;
    model: string;
}
export interface ProjectionFingerprint {
    toolCatalogHash: string;
    modelId: string;
    cwdDigest: string;
    compactionSource: "local" | "server" | "none";
}
export interface ProjectionManifest {
    version: 1;
    algorithm: "sha256";
    savedAt: string;
    /** Hash of the projection content (messages/meta/files). */
    contentHash: string;
    /** Hash of the source JSONL facts at save time, when available. */
    sessionHash?: string;
    /** Highest fact sequence covered by this projection. */
    lastFactSeq?: number;
}
export interface Projection {
    version: 1;
    kind: "projection";
    cwd: string;
    providerId: string;
    model: string;
    fingerprint: ProjectionFingerprint;
    messages: ChatMessage[];
    activeFiles: ActiveFile[];
    lastFactSeq: number;
    /** Integrity data written at save/prune time; never re-derived from facts. */
    manifest?: ProjectionManifest;
}
export type ProjectionReadStatus = "ok" | "legacy" | "hash_mismatch" | "corrupt" | "missing";
export interface ProjectionReadResult {
    status: ProjectionReadStatus;
    projection?: Projection;
    expectedHash?: string;
    actualHash?: string;
}
export interface ResumeState {
    projection: Projection;
    messages: ChatMessage[];
    meta: SessionMeta;
    warnings: string[];
    rebuilt: boolean;
}
export declare function unpairedToolNotice(tool: string): string;
export declare function cwdDigest(cwd: string): string;
export declare function projectionFingerprint(meta: SessionMeta, compactionSource?: ProjectionFingerprint["compactionSource"]): ProjectionFingerprint;
export declare function sameFingerprint(a: ProjectionFingerprint | undefined, b: ProjectionFingerprint): boolean;
export declare function sessionMetaFromFacts(facts: any[]): SessionMeta;
export declare function sessionMetaFromFile(file: string): SessionMeta;
export declare function factsToMessages(facts: any[]): ChatMessage[];
export declare function compactionSourceFromFacts(facts: any[]): ProjectionFingerprint["compactionSource"];
export declare function projectionContentHash(projection: Projection): string;
export declare function factsContentHash(facts: any[]): string;
/**
 * Keep native tool_call/tool_result pairs complete. Orphan tool messages left
 * behind by projection truncation are dropped; missing results are synthesized
 * with the existing "execution unknown" notice so a resumed model never waits
 * for a result that cannot arrive.
 */
export declare function pairToolMessages(messages: ChatMessage[]): {
    messages: ChatMessage[];
    repaired: boolean;
};
export declare function buildProjection(facts: any[], metaOverride?: Partial<SessionMeta>): Projection;
export declare function readProjectionResult(file: string): ProjectionReadResult;
export declare function readProjection(file: string): Projection | undefined;
export declare function writeProjection(file: string, projection: Projection, facts?: any[]): void;
export declare function resumeSession(file: string, currentCwd?: string): ResumeState;
