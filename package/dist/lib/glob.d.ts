export declare const MAX_GLOB_LENGTH = 256;
export declare const MAX_GLOB_DOUBLE_STARS = 4;
export declare const MAX_REGEX_LENGTH = 512;
/** Shared safety limits for model/repo supplied glob patterns. */
export declare function globSafetyError(glob: string): string | undefined;
/** Reject obvious catastrophic-backtracking regexes before RegExp compiles them. */
export declare function regexSafetyError(pattern: string): string | undefined;
