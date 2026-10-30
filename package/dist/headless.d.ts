interface HeadlessOptions {
    prompt: string;
    ui: "json" | "plain";
    resume?: string;
}
export declare function runHeadless(options: HeadlessOptions): Promise<void>;
export {};
