import { compactMessages, compactionConfigFromEnv, removeSummaryFile } from "../agent/compaction.js";
import { latestSessionFile, readSession } from "../session/log.js";
import { getModelMeta } from "../lib/model-meta.js";
export const compactCommand = {
    name: "compact",
    description: "Compact context, list compacted facts, or clean summaries: /compact [list|clean <seq|all>]",
    run({ args, state, actions }) {
        if (args?.[0] === "clean") {
            const file = latestSessionFile();
            if (!file)
                return { message: "No session facts yet." };
            const compacted = readSession(file).filter((fact) => fact?.type === "compacted");
            const target = String(args[1] ?? "").toLowerCase();
            const selected = target === "all" ? compacted : compacted.filter((fact) => String(fact.seq) === target);
            if (selected.length === 0)
                return { message: "Usage: /compact clean <seq|all>" };
            const refs = [];
            for (const fact of selected) {
                if (typeof fact.summaryRef === "string") {
                    removeSummaryFile(fact.summaryRef);
                    refs.push(fact.summaryRef);
                }
            }
            return { message: `Cleaned ${refs.length} summary file(s).`, compactionCleaned: { refs } };
        }
        if (args?.[0] === "list") {
            const file = latestSessionFile();
            if (!file)
                return { message: "No session facts yet." };
            const compacted = readSession(file).filter((fact) => fact?.type === "compacted");
            if (compacted.length === 0)
                return { message: "No compacted facts in the latest session." };
            return { message: ["Compacted facts:", ...compacted.map((fact) => `  seq ${fact.seq}: ${fact.summaryRef ?? "(no summaryRef)"} ? dropped=${fact.droppedCount ?? "unmapped"} ? range=${fact.droppedFromSeq ?? "?"}..${fact.droppedToSeq ?? "?"} ? ${fact.source ?? "?"}`)].join("\n") };
        }
        const config = compactionConfigFromEnv();
        if (!config.enabled)
            return { message: "Compaction is disabled by FASTCODE_COMPACTION." };
        const meta = getModelMeta(state.providerId, state.model);
        const result = compactMessages(state.history, { ...config, localThresholdRatio: 0 }, {
            contextWindow: meta.contextWindow,
            providerId: state.providerId,
            model: state.model,
            force: true,
        });
        if (!result.compacted)
            return { message: "Nothing to compact (history is already small)." };
        actions.replaceHistory(result.messages);
        return {
            message: `[context compacted] ${result.beforeTokens} → ${result.afterTokens} tokens (${result.droppedMessages} messages summarized).` +
                (result.summaryFile ? `\nSummary: ${result.summaryFile}` : ""),
            compacted: {
                summaryRef: result.summaryFile,
                source: "local",
                beforeTokens: result.beforeTokens,
                afterTokens: result.afterTokens,
                droppedMessages: result.droppedMessages,
                ...(result.droppedFromSeq !== undefined ? { droppedFromSeq: result.droppedFromSeq } : {}),
                ...(result.droppedToSeq !== undefined ? { droppedToSeq: result.droppedToSeq } : {}),
                ...(result.droppedCount !== undefined ? { droppedCount: result.droppedCount } : {}),
                ...(result.droppedSeqUnmapped ? { droppedSeqUnmapped: true } : {}),
                keepMessages: result.keptMessages,
                reason: "manual",
            },
        };
    },
};
