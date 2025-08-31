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
        "",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .describe(
                        "Username or alias of the target org. Not required if the 'target-org' configuration variable is already set."
                    ),
                dryRun: z
                    .boolean()
                    .describe(
                        "Validate deploy and run Apex tests but don't save to the org."
                    ),
                manifest: z
                    .string()
                    .optional()
                    .describe(
                        "Full file path for manifest (package.xml) of components to deploy. All child components are included. If you specify this flag, don’t specify --metadata or --source-dir."
                    ),
                metadata: z
                    .string()
                    .optional()
                    .describe(
                        "Metadata component names to deploy. Wildcards (`*` ) supported as long as you use quotes, such as `ApexClass:MyClass*`."
                    ),
                metadataDirectory: z
                    .string()
                    .optional()
                    .describe(
                        "Root of directory or zip file of metadata formatted files to deploy."
                    ),
                singlePackage: z
                    .boolean()
                    .optional()
                    .describe(
                        "Indicates that the metadata zip file points to a directory structure for a single package."
                    ),
                sourceDirectory: z
                    .string()
                    .optional()
                    .describe(
                        "Path to the local source files to deploy. The supplied path can be to a single file (in which case the operation is applied to only one file) or to a folder (in which case the operation is applied to all metadata types in the directory and its subdirectories). If you specify this flag, don’t specify --metadata or --manifest."
                    ),
                tests: z
                    .string()
                    .optional()
                    .describe(
                        'Apex tests to run when --test-level is RunSpecifiedTests. If a test name contains a space, enclose it in double quotes. For multiple test names, use one of the following formats: - Repeat the flag for multiple test names: --tests Test1 --tests Test2 --tests "Test With Space" - Separate the test names with spaces: --tests Test1 Test2 "Test With Space"'
                    ),
                testLevel: z
                    .string()
                    .optional()
                    .describe(
                        "Deployment Apex testing level. Valid values are: - NoTestRun — No tests are run. This test level applies only to deployments to development environments, such as sandbox, Developer Edition, or trial orgs. This test level is the default for development environments. - RunSpecifiedTests — Runs only the tests that you specify with the --tests flag. Code coverage requirements differ from the default coverage requirements when using this test level. Executed tests must comprise a minimum of 75% code coverage for each class and trigger in the deployment package. This coverage is computed for each class and trigger individually and is different than the overall coverage percentage. - RunLocalTests — All tests in your org are run, except the ones that originate from installed managed and unlocked packages. This test level is the default for production deployments that include Apex classes or triggers. - RunAllTestsInOrg — All tests in your org are run, including tests of managed packages.If you don’t specify a test level, the default behavior depends on the contents of your deployment package and target org."
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
