import { compactMessages, compactionConfigFromEnv } from "../agent/compaction.js";
import { getModelMeta } from "../lib/model-meta.js";
export const compactCommand = {
    name: "compact",
    description: "Force local context compaction now",
    run({ state, actions }) {
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
                keepMessages: result.keptMessages,
                reason: "manual",
            },
        };
    },
};
