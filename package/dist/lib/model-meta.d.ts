export interface ModelMeta {
    contextWindow: number;
    supportsTools: boolean;
    charsPerToken: number;
    maxOutputTokens?: number;
}
export interface EstTokenOptions {
    providerId?: string;
    model?: string;
    charsPerToken?: number;
}
export declare const UNKNOWN_MODEL_META: ModelMeta;
export declare function modelMetaOverridePath(): string;
export declare function clearModelMetaCache(): void;
export declare function getModelMeta(providerId?: string, model?: string): ModelMeta;
export declare function estTokens(text: string, options?: number | EstTokenOptions): number;
export declare function estMessagesTokens(messages: Array<{
    content: string;
}>, options?: EstTokenOptions): number;
