import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeSfCommand } from "../utils/sfCommand.js";
import { permissions } from "../config/permissions.js";
import { resolveTargetOrg } from "../utils/resolveTargetOrg.js";

const executePackageInstall = async (
    targetOrg: string,
    packageId: string,
    wait: number = 0,
    installationKey?: string,
    publishWait: number = 0,
    apexCompile: "all" | "package" = "all",
    securityType: "AllUsers" | "AdminsOnly" = "AdminsOnly",
    upgradeType: "DeprecateOnly" | "Mixed" | "Delete" = "Mixed",
    apiVersion?: string
) => {
    let sfCommand = `sf package install --package ${packageId} --target-org ${targetOrg} --no-prompt --json`;

    if (wait > 0) {
        sfCommand += ` --wait ${wait}`;
    }

    if (installationKey) {
        sfCommand += ` --installation-key ${installationKey}`;
    }

    if (publishWait > 0) {
        sfCommand += ` --publish-wait ${publishWait}`;
    }

    if (apexCompile) {
        sfCommand += ` --apex-compile ${apexCompile}`;
    }

    if (securityType) {
        sfCommand += ` --security-type ${securityType}`;
    }

    if (upgradeType) {
        sfCommand += ` --upgrade-type ${upgradeType}`;
    }

    if (apiVersion) {
        sfCommand += ` --api-version ${apiVersion}`;
    }

    try {
        const result = await executeSfCommand(sfCommand);
        return result;
    } catch (error) {
        throw error;
    }
};

const executePackageUninstall = async (
    targetOrg: string,
    packageId: string,
    wait: number = 0,
    apiVersion?: string
) => {
    let sfCommand = `sf package uninstall --package ${packageId} --target-org ${targetOrg} --json`;

    if (wait > 0) {
        sfCommand += ` --wait ${wait}`;
    }

    if (apiVersion) {
        sfCommand += ` --api-version ${apiVersion}`;
    }

    try {
        const result = await executeSfCommand(sfCommand);
        return result;
    } catch (error) {
        throw error;
    }
};

export function registerPackageTools(server: McpServer) {
    server.tool(
        "package_install",
        "Install or upgrade a package version in a Salesforce org. Supports both package IDs (04t) and aliases with various configuration options.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .optional()
                    .describe(
                        "Username or alias of the target org. If not provided, uses the default org from SF CLI configuration.",
                    ),
                packageId: z
                    .string()
                    .describe(
                        "ID (starts with 04t) or alias of the package version to install."
                    ),
                wait: z
                    .number()
                    .optional()
                    .default(0)
                    .describe(
                        "Number of minutes to wait for installation status."
                    ),
                installationKey: z
                    .string()
                    .optional()
                    .describe(
                        "Installation key for key-protected package (default: null)."
                    ),
                publishWait: z
                    .number()
                    .optional()
                    .default(0)
                    .describe(
                        "Maximum number of minutes to wait for the Subscriber Package Version ID to become available in the target org before canceling the install request."
                    ),
                apexCompile: z
                    .enum(["all", "package"])
                    .optional()
                    .default("all")
                    .describe(
                        "Compile all Apex in the org and package, or only Apex in the package; unlocked packages only."
                    ),
                securityType: z
                    .enum(["AllUsers", "AdminsOnly"])
                    .optional()
                    .default("AdminsOnly")
                    .describe(
                        "Security access type for the installed package."
                    ),
                upgradeType: z
                    .enum(["DeprecateOnly", "Mixed", "Delete"])
                    .optional()
                    .default("Mixed")
                    .describe(
                        "Upgrade type for the package installation; available only for unlocked packages. DeprecateOnly: Mark all removed components as deprecated. Mixed: Delete all removed components that can be safely deleted and deprecate the other components. Delete: Delete removed components, except for custom objects and custom fields, that don't have dependencies."
                    ),
                apiVersion: z
                    .string()
                    .optional()
                    .describe(
                        "Override the api version used for api requests made by this command"
                    ),
            }),
        },
        async ({ input }) => {
            let targetOrg: string;
            try {
                targetOrg = await resolveTargetOrg(input.targetOrg);
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                error: error.message,
                            }),
                        },
                    ],
                };
            }

            if (permissions.isReadOnly()) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                error: "Cannot install packages in read-only mode",
                                readOnlyMode: true,
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
                                error: `Access to org '${targetOrg}' is not allowed`,
                                allowedOrgs: permissions.getAllowedOrgs(),
                            }),
                        },
                    ],
                };
            }

            try {
                const result = await executePackageInstall(
                    targetOrg,
                    input.packageId,
                    input.wait,
                    input.installationKey,
                    input.publishWait,
                    input.apexCompile,
                    input.securityType,
                    input.upgradeType,
                    input.apiVersion
                );
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({ targetOrg, ...result }),
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                error:
                                    error.message ||
                                    "Package installation failed",
                                details: error.toString(),
                            }),
                        },
                    ],
                };
            }
        }
    );

    server.tool(
        "package_uninstall",
        "Uninstall a second-generation package from the target org. Specify the package ID (starts with 04t) or alias for the package to uninstall.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .optional()
                    .describe(
                        "Username or alias of the target org. If not provided, uses the default org from SF CLI configuration.",
                    ),
                packageId: z
                    .string()
                    .describe(
                        "ID (starts with 04t) or alias of the package version to uninstall."
                    ),
                wait: z
                    .number()
                    .optional()
                    .default(0)
                    .describe(
                        "Number of minutes to wait for uninstall status."
                    ),
                apiVersion: z
                    .string()
                    .optional()
                    .describe(
                        "Override the api version used for api requests made by this command"
                    ),
            }),
        },
        async ({ input }) => {
            let targetOrg: string;
            try {
                targetOrg = await resolveTargetOrg(input.targetOrg);
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                error: error.message,
                            }),
                        },
                    ],
                };
            }

            if (permissions.isReadOnly()) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                error: "Cannot uninstall packages in read-only mode",
                                readOnlyMode: true,
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
                                error: `Access to org '${targetOrg}' is not allowed`,
                                allowedOrgs: permissions.getAllowedOrgs(),
                            }),
                        },
                    ],
                };
            }

            try {
                const result = await executePackageUninstall(
                    targetOrg,
                    input.packageId,
                    input.wait,
                    input.apiVersion
                );
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({ targetOrg, ...result }),
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                error:
                                    error.message ||
                                    "Package uninstallation failed",
                                details: error.toString(),
                            }),
                        },
                    ],
                };
            }
        }
    );
}
