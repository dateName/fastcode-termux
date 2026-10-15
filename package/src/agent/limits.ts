/**
 * Single source of truth for how much tool output reaches the model.
 *
 * Output is bounded while it is produced, not by slicing a finished string
 * afterwards, so a runaway command or a huge directory listing cannot grow
 * without limit. Override the cap with FASTCODE_TOOL_OUTPUT_LIMIT (characters).
 */
export const DEFAULT_TOOL_OUTPUT_LIMIT = 30000;
export function toolOutputLimit() {
    const raw = Number(process.env["FASTCODE_TOOL_OUTPUT_LIMIT"]);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_TOOL_OUTPUT_LIMIT;
}
/**
 * Bounded text accumulator.
 *
 * mode "head" keeps the first N characters (listings, search hits);
 * mode "tail" keeps the last N (command logs, where the error is last).
 * trimEnd()/toString() mimic a plain string so callers stay simple.
 */
export function createOutputBuffer(limit = toolOutputLimit(), mode = "head") {
    const NL = String.fromCharCode(10);
    let text = "";
    let dropped = 0;
    const buffer = {
        get full() {
            return text.length >= limit;
        },
        push(chunk) {
            const value = String(chunk);
            if (mode === "tail") {
                text += value;
                if (text.length > limit) {
                    const over = text.length - limit;
                    dropped += over;
                    text = text.slice(over);
                }
                return;
            }
            if (text.length >= limit) {
                dropped += value.length;
                return;
            }
            const room = limit - text.length;
            if (value.length <= room) {
                text += value;
            }
            else {
                text += value.slice(0, room);
                dropped += value.length - room;
            }
        },
        line(value) {
            if (text.length > 0)
                buffer.push(NL);
            buffer.push(value);
        },
        value() {
            if (dropped <= 0)
                return text;
            const note = "[" + dropped + " more characters omitted]";
            return mode === "tail" ? note + NL + text : text + NL + note;
        },
        trimEnd() {
            return buffer.value().trimEnd();
        },
        toString() {
            return buffer.value();
        },
    };
    return buffer;
}
