import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeSfCommandRaw } from "../utils/sfCommand.js";
import { permissions } from "../config/permissions.js";

const runCodeAnalyzer = async (
    workspace?: string[],
    target?: string[],
    outputFile?: string,
    ruleSelector?: string[],
    severity?: string,
    configFile?: string,
) => {
    let command = "sf code-analyzer run";

    if (workspace && workspace.length > 0) {
        workspace.forEach((w) => {
            command += ` --workspace "${w}"`;
        });
    }

    if (target && target.length > 0) {
        target.forEach((t) => {
            command += ` --target "${t}"`;
        });
    }

    if (outputFile) {
        command += ` --output-file "${outputFile}"`;
    }

    if (ruleSelector && ruleSelector.length > 0) {
        ruleSelector.forEach((rs) => {
            command += ` --rule-selector "${rs}"`;
        });
    }

    if (severity) {
        command += ` --severity-threshold ${severity}`;
    }

    if (configFile) {
        command += ` --config-file "${configFile}"`;
    }

    const result = await executeSfCommandRaw(command);
    return result;
};

const listCodeAnalyzerRules = async (
    workspace?: string[],
    target?: string[],
    configFile?: string,
    ruleSelector?: string[],
    view?: string,
) => {
    let command = "sf code-analyzer rules";

    if (workspace && workspace.length > 0) {
        workspace.forEach((w) => {
            command += ` --workspace "${w}"`;
        });
    }

    if (target && target.length > 0) {
        target.forEach((t) => {
            command += ` --target "${t}"`;
        });
    }

    if (configFile) {
        command += ` --config-file "${configFile}"`;
    }

    if (ruleSelector && ruleSelector.length > 0) {
        ruleSelector.forEach((rs) => {
            command += ` --rule-selector "${rs}"`;
        });
    }

    if (view) {
        command += ` --view ${view}`;
    }

    const result = await executeSfCommandRaw(command);
    return result;
};

export const registerCodeAnalyzerTools = (server: McpServer) => {
    server.registerTool(
        "run_code_analyzer",
        {
            description:
                "Analyze code for quality and security issues. Run list_code_analyzer_rules first to select appropriate rules for ruleSelector parameter.",
            inputSchema: {
                input: z.object({
                    workspace: z
                        .array(z.string())
                        .optional()
                        .describe(
                            "Files/folders to analyze. Supports glob patterns. Multiple values are summed. Defaults to current folder '.'",
                        ),
                    target: z
                        .array(z.string())
                        .optional()
                        .describe(
                            "Specific files/folders to target within workspace. Supports glob patterns. Defaults to all workspace files.",
                        ),
                    ruleSelector: z
                        .array(z.string())
                        .describe(
                            'Select rules by engine, severity, name, or tag. Use colons to combine (e.g., "eslint:Security:3"). Multiple selectors create union. Run with "all" to see available values.',
                        ),
                    outputFile: z
                        .string()
                        .optional()
                        .describe(
                            "Save output to file. Format auto-detected from extension or defaults to JSON.",
                        ),
                    severity: z
                        .enum(["High", "Medium", "Low"])
                        .optional()
                        .describe(
                            "Exit with error on violations at/above this severity. Default: Low",
                        ),
                    configFile: z
                        .string()
                        .optional()
                        .describe(
                            "Config file to customize rules/engines. Auto-detects code-analyzer.yml/yaml in current folder. Use 'code-analyzer config' to create.",
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
        async ({ input }) => {
            const {
                workspace,
                target,
                outputFile,
                ruleSelector,
                severity,
                configFile,
            } = input;

            if (permissions.isReadOnly()) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    "Code analysis is disabled in read-only mode",
                            }),
                        },
                    ],
                };
            }

            try {
                const result = await runCodeAnalyzer(
                    workspace,
                    target,
                    outputFile,
                    ruleSelector,
                    severity,
                    configFile,
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
                                    "Failed to run code analyzer",
                                error: error,
                            }),
                        },
                    ],
                };
            }
        },
    );

    server.registerTool(
        "list_code_analyzer_rules",
        {
            description:
                "List available code analysis rules with details. Use to determine rules for code-analyzer run command.",
            inputSchema: {
                input: z.object({
                    workspace: z
                        .array(z.string())
                        .optional()
                        .describe(
                            "Files/folders for rule discovery. Supports glob patterns.",
                        ),
                    target: z
                        .array(z.string())
                        .optional()
                        .describe(
                            "Specific files/folders to target within workspace. Supports glob patterns. Defaults to all workspace files.",
                        ),
                    configFile: z
                        .string()
                        .optional()
                        .describe("Config file for rule discovery."),
                    ruleSelector: z
                        .array(z.string())
                        .optional()
                        .describe(
                            "Filter rules by name, tag, category, or engine.",
                        ),
                    view: z
                        .enum(["detail", "table"])
                        .optional()
                        .describe(
                            "Display format: 'table' (concise) or 'detail' (full info). Default: 'table'.",
                        ),
                }),
            },
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async ({ input }) => {
            const { workspace, target, configFile, ruleSelector, view } = input;

            try {
                const result = await listCodeAnalyzerRules(
                    workspace,
                    target,
                    configFile,
                    ruleSelector,
                    view,
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
                                    "Failed to list code analyzer rules",
                                error: error,
                            }),
                        },
                    ],
                };
            }
        },
    );
};
