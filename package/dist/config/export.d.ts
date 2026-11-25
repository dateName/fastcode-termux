export interface ConfigExportOptions {
    withKeys?: boolean;
}
/** Export only user config files; session raw outputs are never included. */
export declare function buildConfigExport(paths: {
    config: string;
    auth: string;
    trust: string;
    root: string;
}, options?: ConfigExportOptions): any;
