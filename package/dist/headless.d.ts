interface HeadlessOptions {
    prompt: string;
    ui: "json" | "plain";
    resume?: string;
    longRun?: boolean;
}
export declare function runHeadless(options: HeadlessOptions): Promise<void>;
export {};
