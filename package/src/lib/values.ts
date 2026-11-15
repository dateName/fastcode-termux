/** Exhaustiveness helper for closed unions. Adding a variant fails to compile. */
export function assertNever(value: never, context: string): never {
    throw new Error(`${context}: unhandled variant ${JSON.stringify(value)}`);
}
