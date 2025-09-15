import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { permissions } from "../config/permissions.js";
import { executeSfCommand, executeSfCommandRaw } from "../utils/sfCommand.js";

const deployStart = async (
    targetOrg: string,
    dryRun: boolean,
    manifest: string,
    metadata: string,
    metadataDirectory: string,
    singlePackage: boolean,
    sourceDirectory: string,
    tests: string,
    testLevel: string
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
    server.tool(
        "deploy_start",
        "Deploy metadata to Salesforce org with test execution options.",
        {
            input: z.object({
                targetOrg: z.string().describe("Target org username or alias."),
                dryRun: z
                    .boolean()
                    .describe("Validate only, don't save changes."),
                manifest: z
                    .string()
                    .optional()
                    .describe(
                        "Package.xml manifest path. Excludes --metadata and --source-dir."
                    ),
                metadata: z
                    .string()
                    .optional()
                    .describe(
                        "Component names to deploy. Supports wildcards with quotes."
                    ),
                metadataDirectory: z
                    .string()
                    .optional()
                    .describe("Metadata directory or zip file to deploy."),
                singlePackage: z
                    .boolean()
                    .optional()
                    .describe(
                        "Metadata zip contains single package structure."
                    ),
                sourceDirectory: z
                    .string()
                    .optional()
                    .describe(
                        "Local source path to deploy. Excludes --metadata and --manifest."
                    ),
                tests: z
                    .string()
                    .optional()
                    .describe(
                        "Tests for RunSpecifiedTests level. Quote names with spaces. Separate multiple with spaces or repeat flag."
                    ),
                testLevel: z
                    .string()
                    .optional()
                    .describe(
                        "Test level: NoTestRun (dev only), RunSpecifiedTests (75% coverage), RunLocalTests (default prod), RunAllTestsInOrg."
                    ),
            }),
        },
        async ({ input }) => {
            const {
                targetOrg,
                dryRun,
                manifest,
                metadata,
                metadataDirectory,
                singlePackage,
                sourceDirectory,
                tests,
                testLevel,
            } = input;

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

            const result = await deployStart(
                targetOrg,
                dryRun,
                manifest || "",
                metadata || "",
                metadataDirectory || "",
                singlePackage || false,
                sourceDirectory || "",
                tests || "",
                testLevel || ""
            );
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result),
                    },
                ],
            };
        }
    );
};
