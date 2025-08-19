import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { permissions } from "../config/permissions.js";
import { getOrgInfo, getOrgAccessToken } from "../shared/connection.js";
import { exec } from "node:child_process";
import { platform } from "node:os";
import z from "zod";

type McpResponse = {
    content: Array<{
        type: "text";
        text: string;
    }>;
};

const createErrorResponse = (
    message: string,
    additional?: object
): McpResponse => ({
    content: [
        {
            type: "text" as const,
            text: JSON.stringify({
                success: false,
                message,
                ...additional,
            }),
        },
    ],
});

const createSuccessResponse = (
    message: string,
    data?: object
): McpResponse => ({
    content: [
        {
            type: "text" as const,
            text: JSON.stringify({
                success: true,
                message,
                ...data,
            }),
        },
    ],
});

const checkOrgPermissions = (targetOrg: string): McpResponse | null => {
    if (!permissions.isOrgAllowed(targetOrg)) {
        return createErrorResponse(
            `Access to org '${targetOrg}' is not allowed`
        );
    }
    return null;
};

const parseJsonData = (
    jsonString: string
): { data: any; error: McpResponse | null } => {
    try {
        return { data: JSON.parse(jsonString), error: null };
    } catch (e) {
        return {
            data: null,
            error: createErrorResponse("Invalid JSON format for record data"),
        };
    }
};

const prepareSalesforceRequest = async (
    targetOrg: string
): Promise<{
    orgInfo?: any;
    accessToken?: string;
    error: McpResponse | null;
}> => {
    const orgInfo = await getOrgInfo(targetOrg);
    if (!orgInfo) {
        return {
            error: createErrorResponse(
                `Could not get org info for ${targetOrg}`
            ),
        };
    }

    const accessToken = await getOrgAccessToken(targetOrg);
    return { orgInfo, accessToken, error: null };
};

const getSalesforceEndpoint = (
    orgInfo: any,
    sObject: string,
    recordId?: string
) => {
    const baseUrl = `${orgInfo.instanceUrl}/services/data/v${orgInfo.apiVersion}/sobjects/${sObject}`;
    return recordId ? `${baseUrl}/${recordId}` : `${baseUrl}/`;
};

const executeSalesforceRestApi = async (
    targetOrg: string,
    sObject: string,
    method: string,
    recordId?: string,
    recordData?: any
): Promise<McpResponse> => {
    const permissionError = checkOrgPermissions(targetOrg);
    if (permissionError) return permissionError;

    try {
        const { orgInfo, accessToken, error } = await prepareSalesforceRequest(
            targetOrg
        );
        if (error) return error;

        const endpoint = getSalesforceEndpoint(orgInfo!, sObject, recordId);

        const headers: any = {
            Authorization: `Bearer ${accessToken}`,
        };
        if (recordData) {
            headers["Content-Type"] = "application/json";
        }

        const response = await fetch(endpoint, {
            method,
            headers,
            body: recordData ? JSON.stringify(recordData) : undefined,
        });

        if (method === "POST") {
            const result = await response.json();
            if (response.ok) {
                return createSuccessResponse(
                    `Successfully created ${sObject} record`,
                    { id: result.id, result }
                );
            } else {
                return createErrorResponse(
                    `Failed to create record: ${response.statusText}`,
                    { errors: result, status: response.status }
                );
            }
        } else if (method === "PATCH" || method === "DELETE") {
            if (response.status === 204) {
                const action = method === "PATCH" ? "updated" : "deleted";
                return createSuccessResponse(
                    `Successfully ${action} ${sObject} record`,
                    { id: recordId }
                );
            } else {
                const result = await response.json();
                const action = method === "PATCH" ? "update" : "delete";
                return createErrorResponse(
                    `Failed to ${action} record: ${response.statusText}`,
                    { errors: result, status: response.status }
                );
            }
        }

        return createErrorResponse("Unknown HTTP method");
    } catch (error) {
        const action =
            method === "POST"
                ? "create"
                : method === "PATCH"
                ? "update"
                : "delete";
        return createErrorResponse(
            error instanceof Error
                ? error.message
                : `Failed to ${action} record`
        );
    }
};

type OpenRecordResult = {
    success: boolean;
    url: string;
    message: string;
};

const openRecordInBrowser = async (
    targetOrg: string,
    recordId: string
): Promise<OpenRecordResult> => {
    const orgInfo = await getOrgInfo(targetOrg);
    if (!orgInfo) {
        throw new Error(`Could not get org info for ${targetOrg}`);
    }

    const instanceUrl = orgInfo.instanceUrl;
    const url = `${instanceUrl}/${recordId}`;

    const currentPlatform = platform();
    let command: string;

    switch (currentPlatform) {
        case "darwin":
            command = `open "${url}"`;
            break;
        case "win32":
            command = `start "" "${url}"`;
            break;
        default:
            command = `xdg-open "${url}"`;
            break;
    }

    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`Failed to open browser: ${error.message}`));
                return;
            }
            resolve({
                success: true,
                url,
                message: `Opened ${recordId} in browser`,
            });
        });
    });
};

export const registerOrgTools = (server: McpServer) => {
    server.tool(
        "open_record",
        "Opens a Salesforce record in a browser.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .describe(
                        "Username or alias of the target org. Not required if the 'target-org' configuration variable is already set."
                    ),
                recordId: z
                    .string()
                    .describe("Id of the Salesforce record to open"),
            }),
        },
        async ({ input }) => {
            const { targetOrg, recordId } = input;

            if (!targetOrg || targetOrg.trim() === "") {
                return createErrorResponse("Target org is required");
            }

            if (!recordId || recordId.trim() === "") {
                return createErrorResponse("Salesforce record Id is required");
            }

            const permissionError = checkOrgPermissions(targetOrg);
            if (permissionError) return permissionError;

            try {
                const result = await openRecordInBrowser(targetOrg, recordId);
                return createSuccessResponse(result.message, {
                    url: result.url,
                });
            } catch (error) {
                return createErrorResponse(
                    error instanceof Error
                        ? error.message
                        : "Failed to open record in browser"
                );
            }
        }
    );

    server.tool(
        "create_record",
        "Create a new record in a Salesforce org using the REST API. Returns the ID of the created record on success.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .describe(
                        "Username or alias of the target org. Not required if the 'target-org' configuration variable is already set."
                    ),
                sObject: z
                    .string()
                    .describe(
                        "API name of the Salesforce object to create a record for (e.g., 'Account', 'Contact', 'CustomObject__c'). Execute the sobject_list tool first to get the correct API name of the SOjbect."
                    ),
                recordJson: z
                    .string()
                    .describe(
                        'JSON string containing the field values for the new record. Example: \'{"Name": "Acme Corp", "Type": "Customer"}\'. Execute the sobject_describe tool first to get the correct field API names and relationships.'
                    ),
            }),
        },
        async ({ input }) => {
            const { targetOrg, sObject, recordJson } = input;

            const { data: recordData, error: jsonError } =
                parseJsonData(recordJson);
            if (jsonError) return jsonError;

            return executeSalesforceRestApi(
                targetOrg,
                sObject,
                "POST",
                undefined,
                recordData
            );
        }
    );

    server.tool(
        "update_record",
        "Update an existing record in a Salesforce org using the REST API. Updates specified fields on the record.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .describe(
                        "Username or alias of the target org. Not required if the 'target-org' configuration variable is already set."
                    ),
                sObject: z
                    .string()
                    .describe(
                        "API name of the Salesforce object (e.g., 'Account', 'Contact', 'CustomObject__c'). Execute the sobject_list tool first to get the correct API name of the SObject."
                    ),
                recordId: z
                    .string()
                    .describe(
                        "Salesforce record ID to update (15 or 18 character ID)"
                    ),
                recordJson: z
                    .string()
                    .describe(
                        'JSON string containing the field values to update. Example: \'{"BillingCity": "San Francisco", "Phone": "(555) 123-4567"}\'. Execute the sobject_describe tool first to get the correct field API names. Only include fields you want to update.'
                    ),
            }),
        },
        async ({ input }) => {
            const { targetOrg, sObject, recordId, recordJson } = input;

            const { data: recordData, error: jsonError } =
                parseJsonData(recordJson);
            if (jsonError) return jsonError;

            return executeSalesforceRestApi(
                targetOrg,
                sObject,
                "PATCH",
                recordId,
                recordData
            );
        }
    );

    server.tool(
        "delete_record",
        "Delete a record from a Salesforce org using the REST API. Permanently removes the specified record.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .describe(
                        "Username or alias of the target org. Not required if the 'target-org' configuration variable is already set."
                    ),
                sObject: z
                    .string()
                    .describe(
                        "API name of the Salesforce object (e.g., 'Account', 'Contact', 'CustomObject__c'). Execute the sobject_list tool first to get the correct API name of the SObject."
                    ),
                recordId: z
                    .string()
                    .describe(
                        "Salesforce record ID to delete (15 or 18 character ID)"
                    ),
            }),
        },
        async ({ input }) => {
            const { targetOrg, sObject, recordId } = input;

            return executeSalesforceRestApi(
                targetOrg,
                sObject,
                "DELETE",
                recordId
            );
        }
    );
};
