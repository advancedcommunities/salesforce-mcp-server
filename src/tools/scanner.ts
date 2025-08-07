import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeSfCommandRaw } from "../utils/sfCommand.js";
import { permissions } from "../config/permissions.js";

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
    verboseViolations?: boolean
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
    pathExpLimit?: number
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
    server.tool(
        "scanner_run",
        "Scan a codebase with a selection of rules. Evaluates rules against specified files and outputs results. When invoked without specifying any rules, all rules are run by default. If any of the input parameters were not provided, then you choose them based on the target file or files.",
        {
            input: z.object({
                target: z
                    .array(z.string())
                    .optional()
                    .describe(
                        "Source code location. Can use glob patterns. Default is '.'. Specify multiple values as comma-separated list."
                    ),
                category: z
                    .array(z.string())
                    .optional()
                    .describe(
                        "One or more categories of rules to run. Specify multiple values as a comma-separated list."
                    ),
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
                        ])
                    )
                    .optional()
                    .describe(
                        "Specify which engines to run. Submit multiple values as a comma-separated list."
                    ),
                eslintConfig: z
                    .string()
                    .optional()
                    .describe(
                        "Specify the location of eslintrc config to customize eslint engine. Cannot be used with --tsconfig flag."
                    ),
                pmdConfig: z
                    .string()
                    .optional()
                    .describe(
                        "Location of PMD rule reference XML file to customize rule selection."
                    ),
                tsConfig: z
                    .string()
                    .optional()
                    .describe(
                        "Location of tsconfig.json file used by the eslint-typescript engine. Cannot be used with --eslintconfig flag."
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
                    .describe(
                        "The output format for results written directly to the console. Default is table."
                    ),
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
                        "An error will be thrown when a violation is found with severity equal to or greater than specified level. Values are 1 (high), 2 (moderate), and 3 (low). Using this flag also invokes --normalize-severity."
                    ),
                normalizeSeverity: z
                    .boolean()
                    .optional()
                    .describe(
                        "Include normalized severity levels 1 (high), 2 (moderate), and 3 (low) with the results. For html format, normalized severity is displayed instead of engine severity."
                    ),
                projectDir: z
                    .array(z.string())
                    .optional()
                    .describe(
                        "The relative or absolute root project directories used to set context for Graph Engine's analysis. Specify multiple values as comma-separated list. Each must be a path, not a glob."
                    ),
                verbose: z
                    .boolean()
                    .optional()
                    .describe("Emit additional command output to stdout."),
                verboseViolations: z
                    .boolean()
                    .optional()
                    .describe(
                        "Includes Retire-js violation-message details about each vulnerability including summary, CVE, and URLs."
                    ),
            }),
        },
        async ({ input }) => {
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
                    verboseViolations
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
        }
    );

    server.tool(
        "scanner_run_dfa",
        "Run Salesforce Graph Engine to scan Apex code for data flow analysis issues. This performs path-based analysis to identify complex issues like SQL injection, SOQL injection, and other security vulnerabilities. If any of the input parameters were not provided, then you choose them based on the target file or files.",
        {
            input: z.object({
                target: z
                    .array(z.string())
                    .optional()
                    .describe(
                        "Source code location. Use glob patterns or specify individual methods with #-syntax. Multiple values specified as comma-separated list. Default is '.'."
                    ),
                projectDir: z
                    .array(z.string())
                    .optional()
                    .describe(
                        "The relative or absolute root project directories used to set context for Graph Engine's analysis. Specify multiple values as comma-separated list. Each must be a path, not a glob."
                    ),
                category: z
                    .array(z.string())
                    .optional()
                    .describe(
                        "One or more categories of rules to run. Specify multiple values as a comma-separated list."
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
                    .describe(
                        "The output format for results written directly to the console."
                    ),
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
                        "An error will be thrown when a violation is found with severity equal to or greater than specified level. Values are 1 (high), 2 (moderate), and 3 (low). Using this flag also invokes --normalize-severity."
                    ),
                normalizeSeverity: z
                    .boolean()
                    .optional()
                    .describe(
                        "Include normalized severity levels 1 (high), 2 (moderate), and 3 (low) with the results. For html format, normalized severity is displayed instead of engine severity."
                    ),
                withPilot: z
                    .boolean()
                    .optional()
                    .describe("Allow pilot rules to execute."),
                verbose: z
                    .boolean()
                    .optional()
                    .describe("Emit additional command output to stdout."),
                ruleThreadCount: z
                    .number()
                    .optional()
                    .describe(
                        "Number of DFA rule-evaluation threads or how many entry points can be evaluated concurrently. Inherits value from SFGE_RULE_THREAD_COUNT environment variable if set."
                    ),
                ruleThreadTimeout: z
                    .number()
                    .optional()
                    .describe(
                        "Time limit in milliseconds for evaluating a single entry point. Inherits value from SFGE_RULE_THREAD_TIMEOUT environment variable if set."
                    ),
                ruleDisableWarningViolation: z
                    .boolean()
                    .optional()
                    .describe(
                        "Disable warning violations from Salesforce Graph Engine. Examples include those on StripInaccessible READ access, to get only high-severity violations. Inherits value from SFGE_RULE_DISABLE_WARNING_VIOLATION env-var if set."
                    ),
                sfgeJvmArgs: z
                    .string()
                    .optional()
                    .describe(
                        "Java Virtual Machine (JVM) arguments to override system defaults while executing Salesforce Graph Engine. Separate multiple arguments by a space."
                    ),
                pathExpLimit: z
                    .number()
                    .optional()
                    .describe(
                        "Path expansion upper boundary to limit complexity of code that Graph Engine analyzes before failing. Set to -1 to remove upper boundary. Inherits value from SFGE_PATH_EXPANSION_LIMIT if set."
                    ),
            }),
        },
        async ({ input }) => {
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
                    pathExpLimit
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
        }
    );
};
