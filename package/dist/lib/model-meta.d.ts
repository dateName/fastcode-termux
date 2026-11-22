export interface ModelPricing {
    inputUsdPerM?: number;
    outputUsdPerM?: number;
}
export interface ModelMeta {
    contextWindow: number;
    supportsTools: boolean;
    charsPerToken: number;
    maxOutputTokens?: number;
    pricing?: ModelPricing;
}
/** Date of the built-in model/context/pricing snapshot. */
export declare const MODEL_META_UPDATED = "2026-11-21";
export interface EstTokenOptions {
    providerId?: string;
    model?: string;
    charsPerToken?: number;
}
export declare const UNKNOWN_MODEL_META: ModelMeta;
export declare function modelMetaOverridePath(): string;
export declare function clearModelMetaCache(): void;
export declare function getModelMeta(providerId?: string, model?: string): ModelMeta;
export declare function modelMetaSource(providerId?: string, model?: string): "override" | "built-in" | "default";
export declare function estimateCostUsd(inputTokens: number, outputTokens: number, pricing: ModelPricing | undefined): number | undefined;
export declare function estTokens(text: string, options?: number | EstTokenOptions): number;
export declare function estMessagesTokens(messages: Array<{
    content: string;
}>, options?: EstTokenOptions): number;
