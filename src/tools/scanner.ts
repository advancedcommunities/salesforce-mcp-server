import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeSfCommandRaw } from "../utils/sfCommand.js";
import { permissions } from "../config/permissions.js";
import { createProgressReporter, type ToolExtra } from "../utils/progress.js";

const runScanner = async (
    target?: string[],
    category?: string[],
    engine?: string[],
    eslintConfig?: string,
    pmdConfig?: string,
    tsConfig?: string,
    format?: string,
    outfile?: string,
    severityThreshold?: number,
    normalizeSeverity?: boolean,
    projectDir?: string[],
    verbose?: boolean,
    verboseViolations?: boolean,
) => {
    let command = "sf scanner run";

    if (target && target.length > 0) {
        command += ` --target "${target.join(",")}"`;
    }

    if (category && category.length > 0) {
        command += ` --category "${category.join(",")}"`;
    }

    if (engine && engine.length > 0) {
        command += ` --engine "${engine.join(",")}"`;
    }

    if (eslintConfig) {
        command += ` --eslintconfig "${eslintConfig}"`;
    }

    if (pmdConfig) {
        command += ` --pmdconfig "${pmdConfig}"`;
    }

    if (tsConfig) {
        command += ` --tsconfig "${tsConfig}"`;
    }

    if (format) {
        command += ` --format ${format}`;
    }

    if (outfile) {
        command += ` --outfile "${outfile}"`;
    }

    if (severityThreshold !== undefined) {
        command += ` --severity-threshold ${severityThreshold}`;
    }

    if (normalizeSeverity) {
        command += ` --normalize-severity`;
    }

    if (projectDir && projectDir.length > 0) {
        command += ` --projectdir "${projectDir.join(",")}"`;
    }

    if (verbose) {
        command += ` --verbose`;
    }

    if (verboseViolations) {
        command += ` --verbose-violations`;
    }

    const result = await executeSfCommandRaw(command);
    return result;
};

const runScannerDfa = async (
    target?: string[],
    projectDir?: string[],
    category?: string[],
    format?: string,
    outfile?: string,
    severityThreshold?: number,
    normalizeSeverity?: boolean,
    withPilot?: boolean,
    verbose?: boolean,
    ruleThreadCount?: number,
    ruleThreadTimeout?: number,
    ruleDisableWarningViolation?: boolean,
    sfgeJvmArgs?: string,
    pathExpLimit?: number,
) => {
    let command = "sf scanner run dfa";

    if (target && target.length > 0) {
        command += ` --target "${target.join(",")}"`;
    }

    if (projectDir && projectDir.length > 0) {
        command += ` --projectdir "${projectDir.join(",")}"`;
    }

    if (category && category.length > 0) {
        command += ` --category "${category.join(",")}"`;
    }

    if (format) {
        command += ` --format ${format}`;
    }

    if (outfile) {
        command += ` --outfile "${outfile}"`;
    }

    if (severityThreshold !== undefined) {
        command += ` --severity-threshold ${severityThreshold}`;
    }

    if (normalizeSeverity) {
        command += ` --normalize-severity`;
    }

    if (withPilot) {
        command += ` --with-pilot`;
    }

    if (verbose) {
        command += ` --verbose`;
    }

    if (ruleThreadCount !== undefined) {
        command += ` --rule-thread-count ${ruleThreadCount}`;
    }

    if (ruleThreadTimeout !== undefined) {
        command += ` --rule-thread-timeout ${ruleThreadTimeout}`;
    }

    if (ruleDisableWarningViolation) {
        command += ` --rule-disable-warning-violation`;
    }

    if (sfgeJvmArgs) {
        command += ` --sfgejvmargs "${sfgeJvmArgs}"`;
    }

    if (pathExpLimit !== undefined) {
        command += ` --pathexplimit ${pathExpLimit}`;
    }

    const result = await executeSfCommandRaw(command);
    return result;
};

export const registerScannerTools = (server: McpServer) => {
    server.registerTool(
        "scanner_run",
        {
            description:
                "Scan codebase with security and quality rules. Defaults to all rules if none specified.",
            inputSchema: {
                input: z.object({
                    target: z
                        .array(z.string())
                        .optional()
                        .describe(
                            "Source location. Supports glob patterns. Default: '.'",
                        ),
                    category: z
                        .array(z.string())
                        .optional()
                        .describe("Rule categories to run."),
                    engine: z
                        .array(
                            z.enum([
                                "eslint",
                                "eslint-lwc",
                                "eslint-typescript",
                                "pmd",
                                "pmd-appexchange",
                                "retire-js",
                                "sfge",
                                "cpd",
                            ]),
                        )
                        .optional()
                        .describe("Engines to run."),
                    eslintConfig: z
                        .string()
                        .optional()
                        .describe(
                            "ESLint config file. Cannot use with tsConfig.",
                        ),
                    pmdConfig: z
                        .string()
                        .optional()
                        .describe("PMD rule XML file."),
                    tsConfig: z
                        .string()
                        .optional()
                        .describe(
                            "TypeScript config file. Cannot use with eslintConfig.",
                        ),
                    format: z
                        .enum([
                            "csv",
                            "html",
                            "json",
                            "junit",
                            "sarif",
                            "table",
                            "xml",
                        ])
                        .optional()
                        .describe("Output format. Default: table"),
                    outfile: z
                        .string()
                        .optional()
                        .describe("File to write output to."),
                    severityThreshold: z
                        .number()
                        .min(1)
                        .max(3)
                        .optional()
                        .describe(
                            "Error on violations at/above this level: 1=high, 2=moderate, 3=low. Auto-enables normalize-severity.",
                        ),
                    normalizeSeverity: z
                        .boolean()
                        .optional()
                        .describe(
                            "Include normalized severity (1=high, 2=moderate, 3=low). HTML format shows normalized only.",
                        ),
                    projectDir: z
                        .array(z.string())
                        .optional()
                        .describe(
                            "Root project directories for Graph Engine context. Must be paths, not globs.",
                        ),
                    verbose: z
                        .boolean()
                        .optional()
                        .describe("Enable verbose output."),
                    verboseViolations: z
                        .boolean()
                        .optional()
                        .describe(
                            "Include Retire-js vulnerability details (CVE, URLs).",
                        ),
                }),
            },
            annotations: {
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: false,
                openWorldHint: true,
            },
        },
        async ({ input }, extra: ToolExtra) => {
            const reportProgress = createProgressReporter(extra, 2);

            const {
                target,
                category,
                engine,
                eslintConfig,
                pmdConfig,
                tsConfig,
                format,
                outfile,
                severityThreshold,
                normalizeSeverity,
                projectDir,
                verbose,
                verboseViolations,
            } = input;

            reportProgress("Validating permissions...");
            if (permissions.isReadOnly()) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    "Scanner is disabled in read-only mode",
                            }),
                        },
                    ],
                };
            }

            try {
                reportProgress("Running scan...");
                const result = await runScanner(
                    target,
                    category,
                    engine,
                    eslintConfig,
                    pmdConfig,
                    tsConfig,
                    format,
                    outfile,
                    severityThreshold,
                    normalizeSeverity,
                    projectDir,
                    verbose,
                    verboseViolations,
                );

                return {
                    content: [
                        {
                            type: "text",
                            text: result,
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    error.message || "Failed to run scanner",
                                error: error,
                            }),
                        },
                    ],
                };
            }
        },
    );

    server.registerTool(
        "scanner_run_dfa",
        {
            description:
                "Run Graph Engine for Apex data flow analysis. Detects complex security issues like SOQL/SQL injection.",
            inputSchema: {
                input: z.object({
                    target: z
                        .array(z.string())
                        .optional()
                        .describe(
                            "Source location. Supports globs or methods with #-syntax. Default: '.'",
                        ),
                    projectDir: z
                        .array(z.string())
                        .optional()
                        .describe(
                            "Root project directories for Graph Engine context. Must be paths, not globs.",
                        ),
                    category: z
                        .array(z.string())
                        .optional()
                        .describe("Rule categories to run."),
                    format: z
                        .enum([
                            "csv",
                            "html",
                            "json",
                            "junit",
                            "sarif",
                            "table",
                            "xml",
                        ])
                        .optional()
                        .describe("Output format for console."),
                    outfile: z
                        .string()
                        .optional()
                        .describe("File to write output to."),
                    severityThreshold: z
                        .number()
                        .min(1)
                        .max(3)
                        .optional()
                        .describe(
                            "Error on violations at/above this level: 1=high, 2=moderate, 3=low. Auto-enables normalize-severity.",
                        ),
                    normalizeSeverity: z
                        .boolean()
                        .optional()
                        .describe(
                            "Include normalized severity (1=high, 2=moderate, 3=low). HTML format shows normalized only.",
                        ),
                    withPilot: z
                        .boolean()
                        .optional()
                        .describe("Enable pilot rules."),
                    verbose: z
                        .boolean()
                        .optional()
                        .describe("Enable verbose output."),
                    ruleThreadCount: z
                        .number()
                        .optional()
                        .describe(
                            "Concurrent DFA evaluation threads. Inherits SFGE_RULE_THREAD_COUNT if set.",
                        ),
                    ruleThreadTimeout: z
                        .number()
                        .optional()
                        .describe(
                            "Entry point evaluation timeout (ms). Inherits SFGE_RULE_THREAD_TIMEOUT if set.",
                        ),
                    ruleDisableWarningViolation: z
                        .boolean()
                        .optional()
                        .describe(
                            "Disable warnings (e.g., StripInaccessible READ). Inherits SFGE_RULE_DISABLE_WARNING_VIOLATION if set.",
                        ),
                    sfgeJvmArgs: z
                        .string()
                        .optional()
                        .describe(
                            "JVM arguments for Graph Engine. Space-separated.",
                        ),
                    pathExpLimit: z
                        .number()
                        .optional()
                        .describe(
                            "Path expansion limit. Use -1 for unlimited. Inherits SFGE_PATH_EXPANSION_LIMIT if set.",
                        ),
                }),
            },
            annotations: {
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: false,
                openWorldHint: true,
            },
        },
        async ({ input }, extra: ToolExtra) => {
            const reportProgress = createProgressReporter(extra, 2);

            const {
                target,
                projectDir,
                category,
                format,
                outfile,
                severityThreshold,
                normalizeSeverity,
                withPilot,
                verbose,
                ruleThreadCount,
                ruleThreadTimeout,
                ruleDisableWarningViolation,
                sfgeJvmArgs,
                pathExpLimit,
            } = input;

            reportProgress("Validating permissions...");
            if (permissions.isReadOnly()) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    "Scanner DFA is disabled in read-only mode",
                            }),
                        },
                    ],
                };
            }

            try {
                reportProgress("Running data flow analysis...");
                const result = await runScannerDfa(
                    target,
                    projectDir,
                    category,
                    format,
                    outfile,
                    severityThreshold,
                    normalizeSeverity,
                    withPilot,
                    verbose,
                    ruleThreadCount,
                    ruleThreadTimeout,
                    ruleDisableWarningViolation,
                    sfgeJvmArgs,
                    pathExpLimit,
                );

                return {
                    content: [
                        {
                            type: "text",
                            text: result,
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    error.message ||
                                    "Failed to run scanner DFA",
                                error: error,
                            }),
                        },
                    ],
                };
            }
        },
    );
};
