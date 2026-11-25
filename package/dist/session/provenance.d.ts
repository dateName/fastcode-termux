export interface ProvenanceReport {
    file: string;
    facts: number;
    lastFactSeq: number;
    projectionStatus: "ok" | "legacy" | "hash_mismatch" | "corrupt" | "missing";
    summaryRef?: string;
    summaryMissing?: boolean;
    droppedFromSeq?: number;
    droppedToSeq?: number;
    droppedCount?: number;
    droppedSeqUnmapped?: boolean;
    rawFacts: number;
    warnings: string[];
    fingerprint?: unknown;
}
export declare function buildProvenance(file: string): ProvenanceReport;
