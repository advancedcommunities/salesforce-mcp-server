#!/usr/bin/env node
// Standalone reproduction + verification for the command-injection report.
//
// Run: node scripts/verify-command-injection-fix.mjs
//
// Reproduces the exact command-construction + exec() path used by
// src/utils/sfCommand.ts (substituting `echo` for the real `sf` binary,
// same as the original disclosure — no live Salesforce org touched),
// against both the vulnerable pattern and the shq()-escaped one.

import { exec } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const shq = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

const marker = join(tmpdir(), `sf-mcp-poc-${Date.now()}`);
rmSync(marker, { force: true });

// The exact payload from the original disclosure email.
const maliciousQuery = `FIND {test}" ; touch ${marker} ; echo "`;

function run(command) {
    return new Promise((resolve) => {
        exec(command, (error, stdout, stderr) =>
            resolve({ error, stdout, stderr }),
        );
    });
}

async function main() {
    console.log("=== 1. VULNERABLE pattern (before fix) ===");
    const vulnerableCommand = `echo data query --target-org myOrg --query "${maliciousQuery}" --json`;
    console.log("Constructed command:", vulnerableCommand);
    await run(vulnerableCommand);
    const vulnerableExploited = existsSync(marker);
    console.log(
        vulnerableExploited
            ? "RESULT: injected `touch` executed -> marker file created. Confirms the original report.\n"
            : "RESULT: marker file NOT created (unexpected — re-check payload).\n",
    );
    rmSync(marker, { force: true });

    console.log("=== 2. FIXED pattern (shq(), this PR) ===");
    const fixedCommand = `echo data query --target-org ${shq("myOrg")} --query ${shq(maliciousQuery)} --json`;
    console.log("Constructed command:", fixedCommand);
    await run(fixedCommand);
    const fixedExploited = existsSync(marker);
    console.log(
        fixedExploited
            ? "RESULT: marker file created — FIX DID NOT WORK.\n"
            : "RESULT: no marker file. The payload reached `echo` as inert single-quoted text, not shell syntax.\n",
    );
    rmSync(marker, { force: true });

    const passed = vulnerableExploited && !fixedExploited;
    console.log(passed ? "PASS" : "FAIL");
    process.exit(passed ? 0 : 1);
}

main();
