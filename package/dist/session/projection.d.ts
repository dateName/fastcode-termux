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
export declare function buildProjection(facts: any[], metaOverride?: Partial<SessionMeta>): Projection;
export declare function readProjection(file: string): Projection | undefined;
export declare function writeProjection(file: string, projection: Projection): void;
export declare function resumeSession(file: string, currentCwd?: string): ResumeState;
