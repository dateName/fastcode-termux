export const PICKER_WINDOW = 9;

export function pickerWindowStart(total: number, index: number, window = PICKER_WINDOW): number {
    const max = Math.max(0, total - 1);
    const active = Math.max(0, Math.min(index, max));
    return Math.max(0, Math.min(active - Math.floor(window / 2), Math.max(0, total - window)));
}
