import type { Provider } from "../types.js";
export declare const PROVIDERS: Provider[];
export declare function getProvider(id: any): Provider;
export declare function getProviderOrThrow(id: any): Provider;
export interface ProbeResult {
    ok: boolean;
    /** Why the probe failed (or why it was skipped), for the picker/doctor. */
    reason: string;
    status?: number;
}
/**
 * Cheap connectivity check used by the model picker to label a list "offline".
 * `listModels()` silently falls back to the static list, so without this probe
 * the UI cannot tell a live catalog from a cached one. The detailed form keeps
 * the reason: DNS/timeout/401 are "offline", a missing /models is "unsupported".
 */
export declare function probeProviderDetailed(provider: any, apiKey: any, timeoutMs?: number): Promise<ProbeResult>;
export declare function probeProvider(provider: any, apiKey: any, timeoutMs?: number): Promise<boolean>;
