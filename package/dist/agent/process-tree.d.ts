import { type ChildProcess } from "node:child_process";
export declare function killProcessTree(child: ChildProcess | undefined, signal?: NodeJS.Signals): void;
