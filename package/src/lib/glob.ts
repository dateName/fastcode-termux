export const MAX_GLOB_LENGTH = 256;
export const MAX_GLOB_DOUBLE_STARS = 4;
export const MAX_REGEX_LENGTH = 512;

/** Shared safety limits for model/repo supplied glob patterns. */
export function globSafetyError(glob: string): string | undefined {
    if (glob.length > MAX_GLOB_LENGTH)
        return `glob is too long (max ${MAX_GLOB_LENGTH} characters)`;
    const doubleStars = (glob.match(/\*\*/g) ?? []).length;
    if (/\*{3,}/.test(glob))
        return "glob contains a run of three or more stars";
    if (doubleStars > MAX_GLOB_DOUBLE_STARS)
        return `glob has too many ** segments (max ${MAX_GLOB_DOUBLE_STARS})`;
    return undefined;
}

/** Reject obvious catastrophic-backtracking regexes before RegExp compiles them. */
export function regexSafetyError(pattern: string): string | undefined {
    if (pattern.length > MAX_REGEX_LENGTH)
        return `regex is too long (max ${MAX_REGEX_LENGTH} characters)`;
    if (/(?:[*+?]|\{\d+(?:,\d*)?\})\)(?:[*+?]|\{\d)/.test(pattern))
        return "regex contains a nested quantifier";
    return undefined;
}
