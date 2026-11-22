export declare const MAX_GLOB_LENGTH = 256;
export declare const MAX_GLOB_DOUBLE_STARS = 8;
/** Shared safety limits for model/repo supplied glob patterns. */
export declare function globSafetyError(glob: string): string | undefined;
