import { cp, rename, rm } from "node:fs/promises";
import type { Tool } from "./types.js";
export interface MoveOps {
    rename: typeof rename;
    cp: typeof cp;
    rm: typeof rm;
}
export declare function moveWithFallback(from: string, to: string, ops?: MoveOps): Promise<"rename" | "copy">;
export declare const movePathTool: Tool;
