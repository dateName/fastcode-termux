import { compactionConfigFromEnv, heapExceeded, localThresholdTokens } from "../agent/compaction.js";
import { estMessagesTokens, getModelMeta } from "../lib/model-meta.js";
export const contextCommand = {
    name: "context",
    description: "Show estimated context tokens, compaction threshold, and heap usage",
    run(ctx) {
        const meta = getModelMeta(ctx.state.providerId, ctx.state.model);
        const config = compactionConfigFromEnv();
        const tokens = estMessagesTokens(ctx.state.history, {
            providerId: ctx.state.providerId,
            model: ctx.state.model,
        });
        const threshold = localThresholdTokens(config, meta.contextWindow);
        const percent = meta.contextWindow > 0 ? (tokens / meta.contextWindow) * 100 : 0;
        const heapMb = process.memoryUsage().heapUsed / 1024 / 1024;
        return {
            message: [
                `Context: ~${tokens.toLocaleString()} / ${meta.contextWindow.toLocaleString()} tokens (${percent.toFixed(1)}%)`,
                `Compaction threshold: ${threshold.toLocaleString()} tokens (${Math.round(config.localThresholdRatio * 100)}%)${config.enabled ? "" : "  [disabled]"}`,
                `Heap: ${heapMb.toFixed(1)} MB / ${config.heapLimitMb} MB${heapExceeded(config) ? "  [forced compaction]" : ""}`,
                `Messages: ${ctx.state.history.length}  ·  chars/token: ~${meta.charsPerToken}`,
            ].join("\n"),
        };
    },
};
