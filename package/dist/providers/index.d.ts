import type { Provider } from "../types.js";
export declare const PROVIDERS: Provider[];
export declare function getProvider(id: any): Provider;
export declare function getProviderOrThrow(id: any): Provider;
/**
 * Cheap connectivity check used by the model picker to label a list "offline".
 * `listModels()` silently falls back to the static list, so without this probe
 * the UI cannot tell a live catalog from a cached one.
 */
export declare function probeProvider(provider: any, apiKey: any, timeoutMs?: number): Promise<boolean>;
