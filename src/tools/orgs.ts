import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listAllOrgs } from "../shared/connection.js";
import { permissions } from "../config/permissions.js";
import { executeSfCommand } from "../utils/sfCommand.js";
import {
    resolveTargetOrg,
    getDefaultOrg,
    clearDefaultOrgCache,
} from "../utils/resolveTargetOrg.js";
import z from "zod";

/**
 * List all connected Salesforce orgs using native APIs
 * @returns Object containing org information
 */
const listConnectedSalesforceOrgs = async () => {
    const orgs = await listAllOrgs();

    // Filter orgs based on ALLOWED_ORGS
    const allowedOrgs = permissions.getAllowedOrgs();
    const filteredOrgs =
        allowedOrgs === "ALL"
            ? orgs
            : orgs.filter((org) => {
                  // Check if org username or any alias is in allowed list
                  if (permissions.isOrgAllowed(org.username)) return true;
                  if (org.aliases) {
                      return org.aliases.some((alias) =>
                          permissions.isOrgAllowed(alias)
                      );
                  }
                  return false;
              });

    const scratchOrgs = filteredOrgs.filter(
        (org) => !org.isDevHub && org.orgId
    );
    const devHubOrgs = filteredOrgs.filter((org) => org.isDevHub);
    const sandboxes = filteredOrgs.filter(
        (org) => !org.isDevHub && org.instanceUrl?.includes(".sandbox.")
    );
    const production = filteredOrgs.filter(
        (org) =>
            !org.isDevHub &&
            !org.instanceUrl?.includes(".sandbox.") &&
            org.instanceUrl?.includes(".salesforce.com")
    );

    return {
        result: {
            devHubOrgs,
            production,
            sandboxes,
            scratchOrgs,
            totalOrgs: filteredOrgs.length,
            permissionMessage:
                allowedOrgs === "ALL"
                    ? undefined
                    : `Showing only allowed orgs: ${allowedOrgs.join(", ")}`,
        },
    };
};

const loginIntoOrg = async (alias: string, isProduction: boolean) => {
    let sfCommand = `sf org login web -a ${alias} --json `;
    sfCommand += isProduction
        ? `-r https://login.salesforce.com`
        : `-r https://test.salesforce.com`;

    try {
        const result = await executeSfCommand(sfCommand);
        return result;
    } catch (error) {
        throw error;
    }
};

const assignPermissionSet = async (
    targetOrg: string,
    permissionSetNames: string[],
    onBehalfOf?: string[]
) => {
    let sfCommand = `sf org assign permset --target-org ${targetOrg}`;

    permissionSetNames.forEach((name) => {
        sfCommand += ` --name "${name}"`;
    });

    if (onBehalfOf && onBehalfOf.length > 0) {
        onBehalfOf.forEach((user) => {
            sfCommand += ` --on-behalf-of "${user}"`;
        });
    }

    sfCommand += ` --json`;

    try {
        const result = await executeSfCommand(sfCommand);
        return result;
    } catch (error) {
        throw error;
    }
};

const assignPermissionSetLicense = async (
    targetOrg: string,
    licenseNames: string[],
    onBehalfOf?: string[]
) => {
    let sfCommand = `sf org assign permsetlicense --target-org ${targetOrg}`;

    licenseNames.forEach((name) => {
        sfCommand += ` --name "${name}"`;
    });

    if (onBehalfOf && onBehalfOf.length > 0) {
        onBehalfOf.forEach((user) => {
            sfCommand += ` --on-behalf-of "${user}"`;
        });
    }

    sfCommand += ` --json`;

    try {
        const result = await executeSfCommand(sfCommand);
        return result;
    } catch (error) {
        throw error;
    }
};

const displayUserInfo = async (targetOrg: string) => {
    const sfCommand = `sf org display user --target-org ${targetOrg} --json`;

    try {
        const result = await executeSfCommand(sfCommand);
        return result;
    } catch (error) {
        throw error;
    }
};

const listMetadata = async (
    targetOrg: string,
    metadataType: string,
    folder?: string,
    apiVersion?: string,
    outputFile?: string
) => {
    let sfCommand = `sf org list metadata --target-org ${targetOrg} --metadata-type ${metadataType}`;

    if (folder) {
        sfCommand += ` --folder "${folder}"`;
    }

    if (apiVersion) {
        sfCommand += ` --api-version ${apiVersion}`;
    }

    if (outputFile) {
        sfCommand += ` --output-file "${outputFile}"`;
    }

    sfCommand += ` --json`;

    try {
        const result = await executeSfCommand(sfCommand);
        return result;
    } catch (error) {
        throw error;
    }
};

const listMetadataTypes = async (
    targetOrg: string,
    apiVersion?: string,
    outputFile?: string
) => {
    let sfCommand = `sf org list metadata-types --target-org ${targetOrg}`;

    if (apiVersion) {
        sfCommand += ` --api-version ${apiVersion}`;
    }

    if (outputFile) {
        sfCommand += ` --output-file "${outputFile}"`;
    }

    sfCommand += ` --json`;

    try {
        const result = await executeSfCommand(sfCommand);
        return result;
    } catch (error) {
        throw error;
    }
};

const logoutFromOrg = async (targetOrg?: string, all?: boolean) => {
    let sfCommand = `sf org logout`;

    if (all) {
        sfCommand += ` --all`;
    } else if (targetOrg) {
        sfCommand += ` --target-org ${targetOrg}`;
    }

    sfCommand += ` --no-prompt --json`;

    try {
        const result = await executeSfCommand(sfCommand);
        return result;
    } catch (error) {
        throw error;
    }
};

const openOrg = async (
    targetOrg: string,
    path?: string,
    browser?: string,
    privateMode?: boolean,
    sourceFile?: string
) => {
    let sfCommand = `sf org open --target-org ${targetOrg}`;

    if (path) {
        sfCommand += ` --path "${path}"`;
    }

    if (browser) {
        sfCommand += ` --browser ${browser}`;
    }

    if (privateMode) {
        sfCommand += ` --private`;
    }

    if (sourceFile) {
        sfCommand += ` --source-file "${sourceFile}"`;
    }

    sfCommand += ` --json`;

    try {
        const result = await executeSfCommand(sfCommand);
        return result;
    } catch (error) {
        throw error;
    }
};

export const registerOrgTools = (server: McpServer) => {
    server.tool(
        "list_connected_salesforce_orgs",
        "List connected Salesforce Orgs. This command retrieves a list of all Salesforce Orgs that are currently connected to the Salesforce CLI. The results are returned in JSON format, providing details about each Org, including its alias, username, and other metadata. Use this command to see which Salesforce Orgs you have access to and can interact with using the Salesforce CLI.",
        {},
        async () => {
            const orgList = await listConnectedSalesforceOrgs();
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(orgList),
                    },
                ],
            };
        }
    );

    server.tool(
        "login_into_org",
        "Authenticate and login to a Salesforce org via web browser. This command opens a browser window for OAuth authentication flow, allowing you to securely connect to a Salesforce org. After successful authentication, the org credentials are stored locally by the Salesforce CLI for future use. Use isProduction=true for production/developer orgs (login.salesforce.com) or isProduction=false for sandboxes/scratch orgs (test.salesforce.com). The alias parameter creates a convenient shorthand name for accessing this org in subsequent commands. IMPORTANT: This tool requires both 'alias' and 'isProduction' parameters to be provided before execution - do not proceed until all required parameters are supplied.",
        {
            input: z.object({
                alias: z.string().describe("An alias of the org to login"),
                isProduction: z
                    .boolean()
                    .describe(
                        "Indicates whether the org will be logged in via https://login.salesforce.com or https://test.salesforce.com URL."
                    ),
            }),
        },
        async ({ input }) => {
            const { alias, isProduction } = input;

            if (!alias || alias.trim() === "") {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: "An alias is required",
                            }),
                        },
                    ],
                };
            }

            const result = await loginIntoOrg(alias, isProduction);
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

    server.tool(
        "assign_permission_set",
        "Assign a permission set to one or more org users. To specify an alias for the --target-org or --on-behalf-of flags, use the CLI username alias, such as the one you set with the 'alias set' command. Don't use the value of the Alias field of the User Salesforce object for the org user. To assign multiple permission sets, specify multiple names in the permissionSetNames array. Enclose names that contain spaces in the array elements. The same syntax applies to onBehalfOf array for specifying multiple users.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .optional()
                    .describe(
                        "Username or alias of the target org. If not provided, uses the default org from SF CLI configuration.",
                    ),
                permissionSetNames: z
                    .array(z.string())
                    .min(1)
                    .describe("Permission set names to assign"),
                onBehalfOf: z
                    .array(z.string())
                    .optional()
                    .describe(
                        "Username or alias to assign the permission set to. If not specified, assigns to the original admin user."
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
                                success: false,
                                message: error.message,
                            }),
                        },
                    ],
                };
            }

            const { permissionSetNames, onBehalfOf } = input;

            if (permissions.isReadOnly()) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    "Cannot assign permission sets in read-only mode",
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
                                message: `Access to org '${targetOrg}' is not allowed`,
                            }),
                        },
                    ],
                };
            }

            if (!permissionSetNames || permissionSetNames.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    "At least one permission set name is required",
                            }),
                        },
                    ],
                };
            }

            const result = await assignPermissionSet(
                targetOrg,
                permissionSetNames,
                onBehalfOf
            );
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ targetOrg, ...result }),
                    },
                ],
            };
        }
    );

    server.tool(
        "assign_permission_set_license",
        "Assign a permission set license to one or more org users. To specify an alias for the --target-org or --on-behalf-of flags, use the CLI username alias, such as the one you set with the 'alias set' command. Don't use the value of the Alias field of the User Salesforce object for the org user. To assign multiple permission set licenses, specify multiple names in the licenseNames array. Enclose names that contain spaces in the array elements. The same syntax applies to onBehalfOf array for specifying multiple users.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .optional()
                    .describe(
                        "Username or alias of the target org. If not provided, uses the default org from SF CLI configuration.",
                    ),
                licenseNames: z
                    .array(z.string())
                    .min(1)
                    .describe("Permission set license names to assign"),
                onBehalfOf: z
                    .array(z.string())
                    .optional()
                    .describe(
                        "Username or alias to assign the permission set license to. If not specified, assigns to the original admin user."
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
                                success: false,
                                message: error.message,
                            }),
                        },
                    ],
                };
            }

            const { licenseNames, onBehalfOf } = input;

            if (permissions.isReadOnly()) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    "Cannot assign permission set licenses in read-only mode",
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
                                message: `Access to org '${targetOrg}' is not allowed`,
                            }),
                        },
                    ],
                };
            }

            if (!licenseNames || licenseNames.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    "At least one permission set license name is required",
                            }),
                        },
                    ],
                };
            }

            const result = await assignPermissionSetLicense(
                targetOrg,
                licenseNames,
                onBehalfOf
            );
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ targetOrg, ...result }),
                    },
                ],
            };
        }
    );

    server.tool(
        "display_user",
        "Display information about a Salesforce user. Output includes the profile name, org ID, access token, instance URL, login URL, and alias if applicable. The displayed alias is local and different from the Alias field of the User sObject record of the new user, which you set in the Setup UI.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .optional()
                    .describe(
                        "Username or alias of the target org. If not provided, uses the default org from SF CLI configuration.",
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
                                success: false,
                                message: error.message,
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
                                message: `Access to org '${targetOrg}' is not allowed`,
                            }),
                        },
                    ],
                };
            }

            const result = await displayUserInfo(targetOrg);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ targetOrg, ...result }),
                    },
                ],
            };
        }
    );

    server.tool(
        "list_metadata",
        "List the metadata components and properties of a specified type. Use this command to identify individual components in your manifest file or if you want a high-level view of particular metadata types in your org. For example, you can use this command to return a list of names of all the CustomObject or Layout components in your org, then use this information in a retrieve command that returns a subset of these components. The username that you use to connect to the org must have the Modify All Data or Modify Metadata Through Metadata API Functions permission.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .optional()
                    .describe(
                        "Username or alias of the target org. If not provided, uses the default org from SF CLI configuration.",
                    ),
                metadataType: z
                    .string()
                    .describe(
                        "Metadata type to be retrieved, such as CustomObject; metadata type names are case-sensitive."
                    ),
                folder: z
                    .string()
                    .optional()
                    .describe(
                        "Folder associated with the component; required for components that use folders; folder names are case-sensitive. Examples of metadata types that use folders are Dashboard, Document, EmailTemplate, and Report."
                    ),
                apiVersion: z
                    .string()
                    .optional()
                    .describe(
                        "API version to use; default is the most recent API version."
                    ),
                outputFile: z
                    .string()
                    .optional()
                    .describe(
                        "Pathname of the file in which to write the results."
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
                                success: false,
                                message: error.message,
                            }),
                        },
                    ],
                };
            }

            const { metadataType, folder, apiVersion, outputFile } = input;

            if (!permissions.isOrgAllowed(targetOrg)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: `Access to org '${targetOrg}' is not allowed`,
                            }),
                        },
                    ],
                };
            }

            if (!metadataType || metadataType.trim() === "") {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: "Metadata type is required",
                            }),
                        },
                    ],
                };
            }

            const result = await listMetadata(
                targetOrg,
                metadataType,
                folder,
                apiVersion,
                outputFile
            );
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ targetOrg, ...result }),
                    },
                ],
            };
        }
    );

    server.tool(
        "list_metadata_types",
        "Display details about the metadata types that are enabled for your org. The information includes Apex classes and triggers, custom objects, custom fields on standard objects, tab sets that define an app, and many other metadata types. Use this information to identify the syntax needed for a <name> element in a manifest file (package.xml). The username that you use to connect to the org must have the Modify All Data or Modify Metadata Through Metadata API Functions permission.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .optional()
                    .describe(
                        "Username or alias of the target org. If not provided, uses the default org from SF CLI configuration.",
                    ),
                apiVersion: z
                    .string()
                    .optional()
                    .describe(
                        "API version to use; default is the most recent API version."
                    ),
                outputFile: z
                    .string()
                    .optional()
                    .describe(
                        "Pathname of the file in which to write the results. Directing the output to a file makes it easier to extract relevant information for your package.xml manifest file."
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
                                success: false,
                                message: error.message,
                            }),
                        },
                    ],
                };
            }

            const { apiVersion, outputFile } = input;

            if (!permissions.isOrgAllowed(targetOrg)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: `Access to org '${targetOrg}' is not allowed`,
                            }),
                        },
                    ],
                };
            }

            const result = await listMetadataTypes(
                targetOrg,
                apiVersion,
                outputFile
            );
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ targetOrg, ...result }),
                    },
                ],
            };
        }
    );

    server.tool(
        "logout",
        "Log out of a Salesforce org. Use targetOrg to logout of a specific org, or set all to true to logout of all orgs. The logout is performed with --no-prompt flag to avoid confirmation prompts. Be careful! If you log out of a scratch org without having access to its password, you can't access the scratch org again, either through the CLI or the Salesforce UI.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .optional()
                    .describe(
                        "Username or alias of the target org to logout from. If not specified and 'all' is false, the command will fail."
                    ),
                all: z
                    .boolean()
                    .optional()
                    .describe(
                        "Logout from all authenticated orgs including Dev Hubs, sandboxes, DE orgs, and expired, deleted, and unknown-status scratch orgs."
                    ),
            }),
        },
        async ({ input }) => {
            const { targetOrg, all } = input;

            if (permissions.isReadOnly()) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    "Cannot logout from orgs in read-only mode",
                            }),
                        },
                    ],
                };
            }

            if (!targetOrg && !all) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    "Either targetOrg or all must be specified",
                            }),
                        },
                    ],
                };
            }

            if (targetOrg && all) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    "Cannot specify both targetOrg and all",
                            }),
                        },
                    ],
                };
            }

            if (targetOrg && !permissions.isOrgAllowed(targetOrg)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: `Access to org '${targetOrg}' is not allowed`,
                            }),
                        },
                    ],
                };
            }

            if (all && permissions.getAllowedOrgs() !== "ALL") {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    "Cannot logout from all orgs when ALLOWED_ORGS is restricted",
                            }),
                        },
                    ],
                };
            }

            const result = await logoutFromOrg(targetOrg, all);
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

    server.tool(
        "open",
        "Open your Salesforce org in a browser. To open a specific page, specify the portion of the URL after 'https://mydomain.my.salesforce.com' as the path value. Use sourceFile to open ApexPage, FlexiPage, Flow, or Agent metadata from your local project in the associated Builder.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .optional()
                    .describe(
                        "Username or alias of the target org. If not provided, uses the default org from SF CLI configuration.",
                    ),
                path: z
                    .string()
                    .optional()
                    .describe(
                        "Navigation URL path to open a specific page (e.g., 'lightning' for Lightning Experience, '/apex/YourPage' for Visualforce)."
                    ),
                browser: z
                    .enum(["chrome", "edge", "firefox"])
                    .optional()
                    .describe("Browser where the org opens."),
                privateMode: z
                    .boolean()
                    .optional()
                    .describe(
                        "Open the org in the default browser using private (incognito) mode."
                    ),
                sourceFile: z
                    .string()
                    .optional()
                    .describe(
                        "Path to ApexPage, FlexiPage, Flow, or Agent metadata to open in the associated Builder."
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
                                success: false,
                                message: error.message,
                            }),
                        },
                    ],
                };
            }

            const { path, browser, privateMode, sourceFile } = input;

            if (!permissions.isOrgAllowed(targetOrg)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: `Access to org '${targetOrg}' is not allowed`,
                            }),
                        },
                    ],
                };
            }

            const result = await openOrg(
                targetOrg,
                path,
                browser,
                privateMode,
                sourceFile
            );
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ targetOrg, ...result }),
                    },
                ],
            };
        }
    );

    server.tool(
        "get_default_org",
        "Get the current default target org configured in the Salesforce CLI. This returns the org alias or username that is used as the default when no targetOrg is specified in other tool calls.",
        {},
        async () => {
            try {
                const result = await executeSfCommand(
                    "sf config get target-org --json",
                );
                const value = result?.result?.[0]?.value;
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                defaultOrg: value || null,
                                message: value
                                    ? `Default target org is '${value}'`
                                    : "No default target org is configured. Set one with: sf config set target-org <alias>",
                            }),
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
                                defaultOrg: null,
                                message:
                                    "No default target org is configured. Set one with: sf config set target-org <alias>",
                            }),
                        },
                    ],
                };
            }
        },
    );

    server.tool(
        "set_default_org",
        "Set the default target org for the Salesforce CLI. Once set, all tools will use this org by default when no targetOrg is specified. The value persists across sessions.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .describe(
                        "Username or alias of the org to set as the default target org.",
                    ),
            }),
        },
        async ({ input }) => {
            const { targetOrg } = input;

            if (!targetOrg || targetOrg.trim() === "") {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    "Target org is required. Provide a username or alias.",
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
                                success: false,
                                message:
                                    "Cannot set default org in read-only mode",
                            }),
                        },
                    ],
                };
            }

            try {
                const result = await executeSfCommand(
                    `sf config set target-org=${targetOrg} --json`,
                );
                clearDefaultOrgCache();
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                defaultOrg: targetOrg,
                                message: `Default target org set to '${targetOrg}'`,
                                result,
                            }),
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
                                    "Failed to set default target org",
                            }),
                        },
                    ],
                };
            }
        },
    );
};
