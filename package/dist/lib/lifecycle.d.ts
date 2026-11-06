export declare function cleanupProcesses(): void;
export interface ProcessGuardOptions {
    onFatal?: (error: unknown) => void;
}
export declare function installProcessGuards(options?: ProcessGuardOptions): () => void;
