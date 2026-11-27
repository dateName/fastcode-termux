/**
 * Public library entry for programmatic use.
 *
 * This module must not import src/index.ts: that file is the CLI entry and
 * calls process.exit. Keep the SDK surface to the contract types + runTask.
 */
export * from "./public/types.js";
export { runTask } from "./runtime/task.js";
