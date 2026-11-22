export const MAX_GLOB_LENGTH = 256;
export const MAX_GLOB_DOUBLE_STARS = 8;
/** Shared safety limits for model/repo supplied glob patterns. */
export function globSafetyError(glob) {
    if (glob.length > MAX_GLOB_LENGTH)
        return `glob is too long (max ${MAX_GLOB_LENGTH} characters)`;
    const doubleStars = (glob.match(/\*\*/g) ?? []).length;
    if (doubleStars > MAX_GLOB_DOUBLE_STARS)
        return `glob has too many ** segments (max ${MAX_GLOB_DOUBLE_STARS})`;
    return undefined;
}
