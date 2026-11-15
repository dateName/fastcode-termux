export function mergeToolCallDelta(accumulator, delta) {
    const index = resolveIndex(accumulator, delta);
    const entry = accumulator.get(index) ?? { id: "", name: "", arguments: "" };
    if (typeof delta.id === "string" && delta.id)
        entry.id = delta.id;
    if (typeof delta.function?.name === "string" && delta.function.name)
        entry.name = delta.function.name;
    const args = delta.function?.arguments;
    // Some gateways send the arguments object directly instead of a JSON
    // string. Normalize the shape instead of dropping the payload.
    if (typeof args === "string")
        entry.arguments += args;
    else if (args !== undefined && args !== null)
        entry.arguments += JSON.stringify(args);
    accumulator.set(index, entry);
}
/**
 * Pick the accumulator slot for a delta.
 *
 * Servers are supposed to send a numeric `index`, but some (Ollama variants,
 * proxies) omit it. Falling back to `accumulator.size` made every chunk a new
 * call, so `{"command":"ls"}` arrived as three truncated arguments strings.
 */
function resolveIndex(accumulator, delta) {
    if (typeof delta.index === "number" && Number.isFinite(delta.index))
        return delta.index;
    const entries = Array.from(accumulator.entries());
    if (entries.length === 0)
        return 0;
    if (typeof delta.id === "string" && delta.id) {
        const sameId = entries.find(([, call]) => call.id === delta.id);
        if (sameId)
            return sameId[0];
        const unnamed = entries.filter(([, call]) => !call.id);
        if (unnamed.length === 1)
            return unnamed[0][0];
        return nextIndex(accumulator);
    }
    // No index and no id: streaming chunks of one call arrive in order, so
    // append to the most recent slot rather than inventing one per chunk.
    return entries[entries.length - 1][0];
}
function nextIndex(accumulator) {
    let next = 0;
    for (const key of accumulator.keys())
        next = Math.max(next, key + 1);
    return next;
}
export function finalizeToolCalls(accumulator) {
    return Array.from(accumulator.entries())
        .sort((a, b) => a[0] - b[0])
        .filter(([, call]) => Boolean(call.name))
        .map(([index, call]) => ({
        id: call.id || `call_${index}`,
        name: call.name,
        arguments: call.arguments || "{}",
    }));
}
