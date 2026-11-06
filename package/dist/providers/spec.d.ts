export interface RequestSpec {
    baseUrl: string;
    chatPath?: string;
    modelsPath?: string | null;
    query?: Record<string, string>;
    pathParams?: Record<string, string>;
    authHeaderName?: string;
    authPrefix?: string;
}
export declare function resolveBaseUrl(spec: RequestSpec): string;
export declare function buildRequestUrl(spec: RequestSpec, path: string, params?: Record<string, string>): string;
export declare function buildHeaders(spec: RequestSpec, apiKey: string, extra?: Record<string, string>): Record<string, string>;
