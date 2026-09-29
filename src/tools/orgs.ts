import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listAllOrgs } from "../shared/connection.js";
import { permissions } from "../config/permissions.js";
import { shq } from "../utils/shellEscape.js";
import { executeSfCommand } from "../utils/sfCommand.js";
import {
    resolveTargetOrg,
    clearDefaultOrgCache,
    getDefaultOrgForClient,
    toClientOrgLabel,
} from "../utils/resolveTargetOrg.js";
import { requestConfirmation } from "../utils/elicitation.js";
import {
    shouldUseClientBrowser,
    buildOrgUrl,
    clientBrowserResult,
} from "../utils/clientBrowser.js";
import {
    maskOrgAuthorization,
    maskOrgIdentifierFields,
    maskOrgReference,
    maskUsername,
    maskInstanceUrl,
    scrubOrgIdentifiers,
} from "../utils/maskIdentifiers.js";
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
            : orgs.filter(
                  // Check if org username or any alias is in allowed list.
                  // Uses a plain lookup rather than permissions.isOrgAllowed,
                  // which logs every miss (with the raw username) to the client.
                  (org) =>
                      allowedOrgs.includes(org.username) ||
                      (org.aliases?.some((alias) =>
                          allowedOrgs.includes(alias),
                      ) ??
                          false),
              );

    const scratchOrgs = filteredOrgs.filter(
        (org) => !org.isDevHub && org.orgId,
    );
    const devHubOrgs = filteredOrgs.filter((org) => org.isDevHub);
    const sandboxes = filteredOrgs.filter(
        (org) => !org.isDevHub && org.instanceUrl?.includes(".sandbox."),
    );
    const production = filteredOrgs.filter(
        (org) =>
            !org.isDevHub &&
            !org.instanceUrl?.includes(".sandbox.") &&
            org.instanceUrl?.includes(".salesforce.com"),
    );

    // Masking is always on and happens only after ALLOWED_ORGS filtering and
    // categorization, which both need the raw values (including the raw
    // instanceUrl). Map to copies so the objects returned by listAllOrgs are
    // never mutated.
    const present = (list: typeof filteredOrgs) =>
        list.map(maskOrgAuthorization);

    return {
        result: {
            devHubOrgs: present(devHubOrgs),
            production: present(production),
            sandboxes: present(sandboxes),
            scratchOrgs: present(scratchOrgs),
            totalOrgs: filteredOrgs.length,
            permissionMessage:
                allowedOrgs === "ALL"
                    ? undefined
                    : `Showing only allowed orgs: ${allowedOrgs
                          .map(maskOrgReference)
                          .join(", ")}`,
            note: "Usernames, org IDs and instance URLs are masked. Use an org alias as targetOrg in other tools; masked usernames will not work. Orgs without an alias need one set by the user first (e.g. 'sf alias set myOrg=<username>').",
        },
    };
};

const loginIntoOrg = async (alias: string, isProduction: boolean) => {
    let sfCommand = `sf org login web -a ${shq(alias)} --json `;
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
    onBehalfOf?: string[],
) => {
    let sfCommand = `sf org assign permset --target-org ${shq(targetOrg)}`;

    permissionSetNames.forEach((name) => {
        sfCommand += ` --name ${shq(name)}`;
    });

    if (onBehalfOf && onBehalfOf.length > 0) {
        onBehalfOf.forEach((user) => {
            sfCommand += ` --on-behalf-of ${shq(user)}`;
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
    onBehalfOf?: string[],
) => {
    let sfCommand = `sf org assign permsetlicense --target-org ${shq(targetOrg)}`;

    licenseNames.forEach((name) => {
        sfCommand += ` --name ${shq(name)}`;
    });

    if (onBehalfOf && onBehalfOf.length > 0) {
        onBehalfOf.forEach((user) => {
            sfCommand += ` --on-behalf-of ${shq(user)}`;
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
    const sfCommand = `sf org display user --target-org ${shq(targetOrg)} --json`;

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
    outputFile?: string,
) => {
    let sfCommand = `sf org list metadata --target-org ${shq(targetOrg)} --metadata-type ${shq(metadataType)}`;

    if (folder) {
        sfCommand += ` --folder ${shq(folder)}`;
    }

    if (apiVersion) {
        sfCommand += ` --api-version ${shq(apiVersion)}`;
    }

    if (outputFile) {
        sfCommand += ` --output-file ${shq(outputFile)}`;
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
    outputFile?: string,
) => {
    let sfCommand = `sf org list metadata-types --target-org ${shq(targetOrg)}`;

    if (apiVersion) {
        sfCommand += ` --api-version ${shq(apiVersion)}`;
    }

    if (outputFile) {
        sfCommand += ` --output-file ${shq(outputFile)}`;
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
        sfCommand += ` --target-org ${shq(targetOrg)}`;
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
    sourceFile?: string,
) => {
    let sfCommand = `sf org open --target-org ${shq(targetOrg)}`;

    if (path) {
        sfCommand += ` --path ${shq(path)}`;
    }

    if (browser) {
        sfCommand += ` --browser ${shq(browser)}`;
    }

    if (privateMode) {
        sfCommand += ` --private`;
    }

    if (sourceFile) {
        sfCommand += ` --source-file ${shq(sourceFile)}`;
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
    const orgInfoSchema = z.object({
        username: z.string(),
        aliases: z.array(z.string()).nullable().optional(),
        orgId: z.string().optional(),
        instanceUrl: z.string().optional(),
        isDevHub: z.boolean().optional(),
        apiVersion: z.string().optional(),
    });

    server.registerTool(
        "list_connected_salesforce_orgs",
        {
            description:
                "List connected Salesforce Orgs. This command retrieves a list of all Salesforce Orgs that are currently connected to the Salesforce CLI. The results are returned in JSON format, providing details about each Org, including its alias, username, and other metadata. Use this command to see which Salesforce Orgs you have access to and can interact with using the Salesforce CLI." +
                " Usernames, org IDs and instance URLs in the result are masked for privacy; refer to orgs by alias when passing targetOrg to other tools.",
            outputSchema: {
                devHubOrgs: z.array(orgInfoSchema),
                production: z.array(orgInfoSchema),
                sandboxes: z.array(orgInfoSchema),
                scratchOrgs: z.array(orgInfoSchema),
                totalOrgs: z.number(),
                permissionMessage: z.string().optional(),
                note: z.string(),
            },
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async () => {
            try {
                const orgList = await listConnectedSalesforceOrgs();
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(orgList),
                        },
                    ],
                    structuredContent: orgList.result,
                };
            } catch (error: any) {
                const message = String(error?.message ?? error);
                return {
                    isError: true,
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: `Failed to list connected orgs: ${scrubOrgIdentifiers(
                                    message,
                                )}`,
                            }),
                        },
                    ],
                };
            }
        },
    );

    server.registerTool(
        "login_into_org",
        {
            description:
                "Authenticate and login to a Salesforce org via web browser. This command opens a browser window for OAuth authentication flow, allowing you to securely connect to a Salesforce org. After successful authentication, the org credentials are stored locally by the Salesforce CLI for future use. Use isProduction=true for production/developer orgs (login.salesforce.com) or isProduction=false for sandboxes/scratch orgs (test.salesforce.com). The alias parameter creates a convenient shorthand name for accessing this org in subsequent commands. IMPORTANT: This tool requires both 'alias' and 'isProduction' parameters to be provided before execution - do not proceed until all required parameters are supplied.",
            inputSchema: {
                input: z.object({
                    alias: z.string().describe("An alias of the org to login"),
                    isProduction: z
                        .boolean()
                        .describe(
                            "Indicates whether the org will be logged in via https://login.salesforce.com or https://test.salesforce.com URL.",
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
            // The CLI result carries the new org's username, org ID and
            // instance/login URLs, none of which the AI supplied; mask them.
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(maskOrgIdentifierFields(result)),
                    },
                ],
            };
        },
    );

    server.registerTool(
        "assign_permission_set",
        {
            description:
                "Assign a permission set to one or more org users. To specify an alias for the --target-org or --on-behalf-of flags, use the CLI username alias, such as the one you set with the 'alias set' command. Don't use the value of the Alias field of the User Salesforce object for the org user. To assign multiple permission sets, specify multiple names in the permissionSetNames array. Enclose names that contain spaces in the array elements. The same syntax applies to onBehalfOf array for specifying multiple users.",
            inputSchema: {
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
                            "Username or alias to assign the permission set to. If not specified, assigns to the original admin user.",
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
                                message: `Access to org '${maskOrgReference(targetOrg)}' is not allowed`,
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
                onBehalfOf,
            );
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            targetOrg: await toClientOrgLabel(targetOrg),
                            ...result,
                        }),
                    },
                ],
            };
        },
    );

    server.registerTool(
        "assign_permission_set_license",
        {
            description:
                "Assign a permission set license to one or more org users. To specify an alias for the --target-org or --on-behalf-of flags, use the CLI username alias, such as the one you set with the 'alias set' command. Don't use the value of the Alias field of the User Salesforce object for the org user. To assign multiple permission set licenses, specify multiple names in the licenseNames array. Enclose names that contain spaces in the array elements. The same syntax applies to onBehalfOf array for specifying multiple users.",
            inputSchema: {
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
                            "Username or alias to assign the permission set license to. If not specified, assigns to the original admin user.",
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
                                message: `Access to org '${maskOrgReference(targetOrg)}' is not allowed`,
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
                onBehalfOf,
            );
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            targetOrg: await toClientOrgLabel(targetOrg),
                            ...result,
                        }),
                    },
                ],
            };
        },
    );

    server.registerTool(
        "display_user",
        {
            description:
                "Display information about a Salesforce user. Output includes the profile name, org ID, access token, instance URL, login URL, and alias if applicable. The username, org ID, instance URL and login URL are masked for privacy. The displayed alias is local and different from the Alias field of the User sObject record of the new user, which you set in the Setup UI.",
            inputSchema: {
                input: z.object({
                    targetOrg: z
                        .string()
                        .optional()
                        .describe(
                            "Username or alias of the target org. If not provided, uses the default org from SF CLI configuration.",
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
                                message: `Access to org '${maskOrgReference(targetOrg)}' is not allowed`,
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
                        text: JSON.stringify({
                            targetOrg: await toClientOrgLabel(targetOrg),
                            // Username, org ID and instance/login URLs are
                            // masked like in list_connected_salesforce_orgs.
                            ...maskOrgIdentifierFields(result),
                        }),
                    },
                ],
            };
        },
    );

    server.registerTool(
        "list_metadata",
        {
            description:
                "List the metadata components and properties of a specified type. Use this command to identify individual components in your manifest file or if you want a high-level view of particular metadata types in your org. For example, you can use this command to return a list of names of all the CustomObject or Layout components in your org, then use this information in a retrieve command that returns a subset of these components. The username that you use to connect to the org must have the Modify All Data or Modify Metadata Through Metadata API Functions permission.",
            inputSchema: {
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
                            "Metadata type to be retrieved, such as CustomObject; metadata type names are case-sensitive.",
                        ),
                    folder: z
                        .string()
                        .optional()
                        .describe(
                            "Folder associated with the component; required for components that use folders; folder names are case-sensitive. Examples of metadata types that use folders are Dashboard, Document, EmailTemplate, and Report.",
                        ),
                    apiVersion: z
                        .string()
                        .optional()
                        .describe(
                            "API version to use; default is the most recent API version.",
                        ),
                    outputFile: z
                        .string()
                        .optional()
                        .describe(
                            "Pathname of the file in which to write the results.",
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
                                message: `Access to org '${maskOrgReference(targetOrg)}' is not allowed`,
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
                outputFile,
            );
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            targetOrg: await toClientOrgLabel(targetOrg),
                            ...result,
                        }),
                    },
                ],
            };
        },
    );

    server.registerTool(
        "list_metadata_types",
        {
            description:
                "Display details about the metadata types that are enabled for your org. The information includes Apex classes and triggers, custom objects, custom fields on standard objects, tab sets that define an app, and many other metadata types. Use this information to identify the syntax needed for a <name> element in a manifest file (package.xml). The username that you use to connect to the org must have the Modify All Data or Modify Metadata Through Metadata API Functions permission.",
            inputSchema: {
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
                            "API version to use; default is the most recent API version.",
                        ),
                    outputFile: z
                        .string()
                        .optional()
                        .describe(
                            "Pathname of the file in which to write the results. Directing the output to a file makes it easier to extract relevant information for your package.xml manifest file.",
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
                                message: `Access to org '${maskOrgReference(targetOrg)}' is not allowed`,
                            }),
                        },
                    ],
                };
            }

            const result = await listMetadataTypes(
                targetOrg,
                apiVersion,
                outputFile,
            );
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            targetOrg: await toClientOrgLabel(targetOrg),
                            ...result,
                        }),
                    },
                ],
            };
        },
    );

    server.registerTool(
        "logout",
        {
            description:
                "Log out of a Salesforce org. Use targetOrg to logout of a specific org, or set all to true to logout of all orgs. The logout is performed with --no-prompt flag to avoid confirmation prompts. Be careful! If you log out of a scratch org without having access to its password, you can't access the scratch org again, either through the CLI or the Salesforce UI.",
            inputSchema: {
                input: z.object({
                    targetOrg: z
                        .string()
                        .optional()
                        .describe(
                            "Username or alias of the target org to logout from. If not specified and 'all' is false, the command will fail.",
                        ),
                    all: z
                        .boolean()
                        .optional()
                        .describe(
                            "Logout from all authenticated orgs including Dev Hubs, sandboxes, DE orgs, and expired, deleted, and unknown-status scratch orgs.",
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
                                message: `Access to org '${maskOrgReference(targetOrg)}' is not allowed`,
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

            const confirmMsg = all
                ? "Log out of ALL authenticated Salesforce orgs?"
                : `Log out of Salesforce org '${targetOrg}'?`;
            const { confirmed, message: confirmMessage } =
                await requestConfirmation(confirmMsg);
            if (!confirmed) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: confirmMessage,
                            }),
                        },
                    ],
                };
            }

            const result = await logoutFromOrg(targetOrg, all);
            // `sf org logout --json` returns the raw usernames that were
            // logged out; mask them (the AI only supplied an alias or all).
            const safeResult = maskOrgIdentifierFields(result);
            if (Array.isArray(safeResult?.result)) {
                safeResult.result = safeResult.result.map((entry: unknown) =>
                    typeof entry === "string" ? maskUsername(entry) : entry,
                );
            }
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(safeResult),
                    },
                ],
            };
        },
    );

    server.registerTool(
        "open",
        {
            description:
                "Open your Salesforce org in a browser. To open a specific page, specify the portion of the URL after 'https://mydomain.my.salesforce.com' as the path value. Use sourceFile to open ApexPage, FlexiPage, Flow, or Agent metadata from your local project in the associated Builder." +
                (permissions.usesClientBrowser()
                    ? " Client browser mode is enabled: instead of launching the desktop browser, this tool returns a pre-authenticated URL that you should open with your own built-in browser tool. Pass forceSystemBrowser: true to launch the user's desktop browser instead; passing browser or privateMode does the same, since those options only apply to the desktop browser."
                    : ""),
            inputSchema: {
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
                            "Navigation URL path to open a specific page (e.g., 'lightning' for Lightning Experience, '/apex/YourPage' for Visualforce).",
                        ),
                    browser: z
                        .enum(["chrome", "edge", "firefox"])
                        .optional()
                        .describe("Browser where the org opens."),
                    privateMode: z
                        .boolean()
                        .optional()
                        .describe(
                            "Open the org in the default browser using private (incognito) mode.",
                        ),
                    sourceFile: z
                        .string()
                        .optional()
                        .describe(
                            "Path to ApexPage, FlexiPage, Flow, or Agent metadata to open in the associated Builder.",
                        ),
                    forceSystemBrowser: z
                        .boolean()
                        .optional()
                        .describe(
                            "Launch the user's desktop browser even when client browser mode is enabled. Use when the user explicitly asks for their own browser (e.g. to reuse an existing session or extensions).",
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
                path,
                browser,
                privateMode,
                sourceFile,
                forceSystemBrowser,
            } = input;

            if (!permissions.isOrgAllowed(targetOrg)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: `Access to org '${maskOrgReference(targetOrg)}' is not allowed`,
                            }),
                        },
                    ],
                };
            }

            // The CLI declares --path and --source-file mutually exclusive;
            // catch it here so the caller gets a usable message.
            if (path && sourceFile) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                targetOrg: await toClientOrgLabel(targetOrg),
                                message:
                                    "Provide either path or sourceFile, not both — the Salesforce CLI rejects the combination.",
                            }),
                        },
                    ],
                };
            }

            // browser and privateMode are requests for a specific desktop
            // browser window, so treat them as an opt-out of client browser
            // mode rather than dropping the user's intent.
            const desktopRequested = Boolean(
                forceSystemBrowser || browser || privateMode,
            );

            // Hand the URL to the client's built-in browser instead of
            // launching the desktop browser when the setting is enabled.
            if (shouldUseClientBrowser(desktopRequested)) {
                try {
                    const url = await buildOrgUrl(targetOrg, {
                        path,
                        sourceFile,
                    });
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({
                                    success: true,
                                    targetOrg:
                                        await toClientOrgLabel(targetOrg),
                                    ...clientBrowserResult(
                                        url,
                                        `org '${targetOrg}'`,
                                    ),
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
                                    targetOrg:
                                        await toClientOrgLabel(targetOrg),
                                    message: error.message,
                                }),
                            },
                        ],
                    };
                }
            }

            const usedDesktopFallback =
                permissions.usesClientBrowser() && !forceSystemBrowser;

            try {
                const result = await openOrg(
                    targetOrg,
                    path,
                    browser,
                    privateMode,
                    sourceFile,
                );
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                targetOrg: await toClientOrgLabel(targetOrg),
                                ...(usedDesktopFallback
                                    ? {
                                          systemBrowserReason:
                                              "browser and privateMode only work in the desktop browser, so the org was opened there despite client browser mode",
                                      }
                                    : {}),
                                // The desktop browser is already open, so the
                                // login URL (with its token), username and org
                                // ID are masked rather than echoed back.
                                ...maskOrgIdentifierFields({
                                    ...result,
                                    result: result?.result
                                        ? {
                                              ...result.result,
                                              url: maskInstanceUrl(
                                                  result.result.url,
                                              ),
                                          }
                                        : result?.result,
                                }),
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
                                targetOrg: await toClientOrgLabel(targetOrg),
                                message: error.message,
                            }),
                        },
                    ],
                };
            }
        },
    );

    server.registerTool(
        "get_default_org",
        {
            description:
                "Get the current default target org configured in the Salesforce CLI. Returns only the org's alias, which is used as the default when no targetOrg is specified in other tool calls. If the default org has no alias, a masked username is returned with a hint asking the user to set an alias; usernames, org IDs and instance URLs are never returned.",
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async () => {
            const notConfigured =
                "No default target org is configured. Set one with: sf config set target-org <alias>";
            try {
                const { org, isAlias, message } =
                    await getDefaultOrgForClient();
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                defaultOrg: org,
                                isAlias,
                                message: !org
                                    ? notConfigured
                                    : isAlias
                                      ? `Default target org is '${org}'`
                                      : message,
                            }),
                        },
                    ],
                };
            } catch {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                defaultOrg: null,
                                message: notConfigured,
                            }),
                        },
                    ],
                };
            }
        },
    );

    server.registerTool(
        "set_default_org",
        {
            description:
                "Set the default target org for the Salesforce CLI. Once set, all tools will use this org by default when no targetOrg is specified. The value persists across sessions.",
            inputSchema: {
                input: z.object({
                    targetOrg: z
                        .string()
                        .describe(
                            "Username or alias of the org to set as the default target org.",
                        ),
                }),
            },
            annotations: {
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
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
                    `sf config set target-org=${shq(targetOrg)} --json`,
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

    server.registerTool(
        "clear_default_org",
        {
            description:
                "Clear the default target org from the Salesforce CLI configuration. After clearing, all tools will require an explicit targetOrg parameter until a new default is set.",
            annotations: {
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async () => {
            if (permissions.isReadOnly()) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    "Cannot clear default org in read-only mode",
                            }),
                        },
                    ],
                };
            }

            try {
                const result = await executeSfCommand(
                    "sf config unset target-org --json",
                );
                clearDefaultOrgCache();
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                message:
                                    "Default target org has been cleared. You must now specify targetOrg explicitly for each tool call.",
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
                                    "Failed to clear default target org",
                            }),
                        },
                    ],
                };
            }
        },
    );
};
