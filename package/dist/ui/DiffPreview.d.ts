export interface DiffPreviewItem {
    path: string;
    unified: string;
}
/** Bounded unified diff text for plain/json/terminal fallbacks. */
export declare function formatUnifiedDiff(unified: string, maxLines?: number): string;
export declare function formatDiffPreview(diffs: DiffPreviewItem[] | undefined, maxLines?: number): string;
/** Compact Ink rendering; the caller owns layout and permissions. */
export declare const DiffPreview: ({ diffs, theme, maxLines }: any) => import("react").ReactElement<any, string | import("react").JSXElementConstructor<any>>;
