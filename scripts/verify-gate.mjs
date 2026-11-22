#!/usr/bin/env node
/**
 * CI gate self-check.
 *
 * Verifies that the PR/push workflow exists with the required triggers, Node
 * version, and verification steps, and that the built bundle still contains the
 * runtime string literals the gate relies on. `--self-test` also proves that a
 * removed literal is detected (the negative case).
 */
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const cwd = process.cwd();
const root = existsSync(join(cwd, ".github", "workflows", "verify.yml")) ? cwd : resolve(cwd, "..");
const workflowPath = join(root, ".github", "workflows", "verify.yml");
const distPath = join(root, "package", "dist", "cli.js");
const guardsPath = join(root, "package", "dist", "agent", "guards.js");
const egressPath = join(root, "package", "dist", "agent", "policy", "egress.js");
const WORKFLOW_REQUIREMENTS = [
    "pull_request",
    "push:",
    "node-version: 24",
    "npm run check",
    "verify:artifacts",
    "verify-gate.mjs",
    "git diff --exit-code",
    "package/dist",
];
const REQUIRED_LITERALS = [
    "UNSUPPORTED_DIALECT",
    "egress_denied",
    "FASTCODE_STDIO_COMMAND",
    "fastcode_tool",
    "Tool-call protocol failed",
];

function fail(message) {
    console.error("verify-gate: FAIL " + message);
    process.exit(1);
}

function checkWorkflow() {
    if (!existsSync(workflowPath))
        fail(`missing workflow: ${workflowPath}`);
    const text = readFileSync(workflowPath, "utf8");
    const missing = WORKFLOW_REQUIREMENTS.filter((needle) => !text.includes(needle));
    if (missing.length > 0)
        fail("workflow is missing: " + missing.join(", "));
}

function missingLiterals(path, literals = REQUIRED_LITERALS) {
    if (!existsSync(path))
        fail(`missing artifact: ${path}`);
    const text = readFileSync(path, "utf8");
    return literals.filter((literal) => !text.includes(literal));
}

checkWorkflow();
const missingCli = missingLiterals(distPath);
if (missingCli.length > 0)
    fail("dist/cli.js is missing runtime literals: " + missingCli.join(", "));
const missingGuards = missingLiterals(guardsPath, ["HARD_BLOCK", "SOFT_GATE"]);
const missingEgress = missingLiterals(egressPath, ["EGRESS_DENY"]);
if (missingGuards.length > 0)
    fail("dist/agent/guards.js is missing runtime literals: " + missingGuards.join(", "));
if (missingEgress.length > 0)
    fail("dist/agent/policy/egress.js is missing runtime literals: " + missingEgress.join(", "));

if (process.argv.includes("--self-test")) {
    const dir = mkdtempSync(join(tmpdir(), "fastcode-gate-"));
    try {
        const broken = join(dir, "cli.js");
        copyFileSync(distPath, broken);
        const literal = REQUIRED_LITERALS[0];
        writeFileSync(broken, readFileSync(broken, "utf8").split(literal).join("__removed__"), "utf8");
        const detected = missingLiterals(broken).includes(literal);
        if (!detected)
            fail("self-test did not detect a removed runtime literal");
        console.log("verify-gate: self-test PASS");
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

console.log("verify-gate: PASS");
