import { existsSync } from "node:fs";
import { readSession } from "./log.js";
import { readProjectionResult } from "./projection.js";
export function buildProvenance(file) {
    const facts = readSession(file);
    const read = readProjectionResult(file);
    const projection = read.projection;
    const lastCompacted = [...facts].reverse().find((fact) => fact?.type === "compacted");
    let lastFactSeq = 0;
    let rawFacts = 0;
    for (const fact of facts) {
        if (typeof fact?.seq === "number" && fact.seq > lastFactSeq)
            lastFactSeq = fact.seq;
        if (fact?.collection?.rawRef)
            rawFacts += 1;
    }
    const warnings = [];
    if (read.status === "missing")
        warnings.push("projection missing; rebuild from facts required");
    else if (read.status === "hash_mismatch")
        warnings.push("projection manifest hash mismatch");
    else if (read.status === "corrupt")
        warnings.push("projection file corrupt");
    if (lastCompacted?.summaryRef && !existsSync(lastCompacted.summaryRef))
        warnings.push("latest summary file is missing");
    return {
        file,
        facts: facts.length,
        lastFactSeq,
        projectionStatus: read.status,
        ...(lastCompacted?.summaryRef ? { summaryRef: lastCompacted.summaryRef } : {}),
        ...(lastCompacted?.summaryRef && !existsSync(lastCompacted.summaryRef) ? { summaryMissing: true } : {}),
        ...(lastCompacted?.droppedFromSeq !== undefined ? { droppedFromSeq: Number(lastCompacted.droppedFromSeq) } : {}),
        ...(lastCompacted?.droppedToSeq !== undefined ? { droppedToSeq: Number(lastCompacted.droppedToSeq) } : {}),
        ...(lastCompacted?.droppedCount !== undefined ? { droppedCount: Number(lastCompacted.droppedCount) } : {}),
        ...(lastCompacted?.droppedSeqUnmapped ? { droppedSeqUnmapped: true } : {}),
        rawFacts,
        warnings,
        ...(projection?.fingerprint ? { fingerprint: projection.fingerprint } : {}),
    };
}
