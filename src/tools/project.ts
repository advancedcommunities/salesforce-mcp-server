import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { permissions } from "../config/permissions.js";
import { executeSfCommand } from "../utils/sfCommand.js";
import { resolveTargetOrg } from "../utils/resolveTargetOrg.js";
import { createProgressReporter, type ToolExtra } from "../utils/progress.js";

const deployStart = async (
    targetOrg: string,
    dryRun: boolean,
    manifest: string,
    metadata: string,
    metadataDirectory: string,
    singlePackage: boolean,
    sourceDirectory: string,
    tests: string,
    testLevel: string,
) => {
    let sfCommand = `sf project deploy start --target-org ${targetOrg} --json `;

    if (dryRun) {
        sfCommand += `--dry-run `;
    }

    if (manifest && manifest.length > 0) {
        sfCommand += `--manifest ${manifest} `;
    }

    if (metadata && metadata.length > 0) {
        sfCommand += `--metadata ${metadata} `;
    }

    if (metadataDirectory && metadataDirectory.length > 0) {
        sfCommand += `--metadata-dir ${metadataDirectory} `;
    }

    if (singlePackage) {
        sfCommand += `--single-package `;
    }

    if (sourceDirectory && sourceDirectory.length > 0) {
        sfCommand += `--source-dir ${sourceDirectory} `;
    }

    if (tests && tests.length > 0) {
        sfCommand += `--tests ${tests} `;
    }

    if (testLevel && testLevel.length > 0) {
        sfCommand += `--test-level ${testLevel} `;
    }

    try {
        const result = await executeSfCommand(sfCommand);
        return result;
    } catch (error) {
        throw error;
    }
};

export const registerProjectTools = (server: McpServer) => {
    server.registerTool(
        "deploy_start",
        {
            description:
                "Deploy metadata to Salesforce org with test execution options.",
            inputSchema: {
                input: z.object({
                    targetOrg: z
                        .string()
                        .optional()
                        .describe(
                            "Target org username or alias. If not provided, uses the default org from SF CLI configuration.",
                        ),
                    dryRun: z
                        .boolean()
                        .describe("Validate only, don't save changes."),
                    manifest: z
                        .string()
                        .optional()
                        .describe(
                            "Package.xml manifest path. Excludes --metadata and --source-dir.",
                        ),
                    metadata: z
                        .string()
                        .optional()
                        .describe(
                            "Component names to deploy. Supports wildcards with quotes.",
                        ),
                    metadataDirectory: z
                        .string()
                        .optional()
                        .describe("Metadata directory or zip file to deploy."),
                    singlePackage: z
                        .boolean()
                        .optional()
                        .describe(
                            "Metadata zip contains single package structure.",
                        ),
                    sourceDirectory: z
                        .string()
                        .optional()
                        .describe(
                            "Local source path to deploy - can be a directory OR a specific file path (e.g., 'force-app/main' or 'force-app/main/default/classes/MyClass.cls'). For single file deployment, provide the exact file path. If you specify this flag, don't specify --metadata or --manifest.",
                        ),
                    tests: z
                        .string()
                        .optional()
                        .describe(
                            "Tests for RunSpecifiedTests level. Quote names with spaces. Separate multiple with spaces or repeat flag.",
                        ),
                    testLevel: z
                        .string()
                        .optional()
                        .describe(
                            "Test level: NoTestRun (dev only), RunSpecifiedTests (75% coverage), RunLocalTests (default prod), RunAllTestsInOrg.",
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
            const reportProgress = createProgressReporter(extra, 3);

            reportProgress("Resolving target org...");
            let targetOrg: string;
            try {
                targetOrg = await resolveTargetOrg(input.targetOrg);
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: error.message,
                            }),
                        },
                    ],
                };
            }

            const {
                dryRun,
                manifest,
                metadata,
                metadataDirectory,
                singlePackage,
                sourceDirectory,
                tests,
                testLevel,
            } = input;

            reportProgress("Validating permissions...");
            if (permissions.isReadOnly()) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                compiled: false,
                                compileProblem:
                                    "Operation not allowed: Cannot generate components in READ_ONLY mode",
                            }),
                        },
                    ],
                };
            }

            if (!permissions.isOrgAllowed(targetOrg)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: `Access denied: Org '${targetOrg}' is not in the allowed list`,
                            }),
                        },
                    ],
                };
            }

            reportProgress("Deploying metadata...");
            const result = await deployStart(
                targetOrg,
                dryRun,
                manifest || "",
                metadata || "",
                metadataDirectory || "",
                singlePackage || false,
                sourceDirectory || "",
                tests || "",
                testLevel || "",
            );
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ targetOrg, ...result }),
                    },
                ],
            };
        },
    );
};
