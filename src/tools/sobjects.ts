import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeSfCommand } from "../utils/sfCommand.js";
import { permissions } from "../config/permissions.js";
import { resolveTargetOrg } from "../utils/resolveTargetOrg.js";

const executeSobjectList = async (targetOrg: string) => {
    const sfCommand = `sf sobject list --sobject all --target-org ${targetOrg} --json`;

    try {
        const result = await executeSfCommand(sfCommand);
        return result;
    } catch (error) {
        throw error;
    }
};

const executeSObjectDescribe = async (
    targetOrg: string,
    sObjectName: string,
) => {
    const sfCommand = `sf sobject describe --sobject ${sObjectName} --target-org ${targetOrg} --json`;

    try {
        const result = await executeSfCommand(sfCommand);
        return result;
    } catch (error) {
        throw error;
    }
};

export const registerSObjectTools = (server: McpServer) => {
    server.registerTool(
        "sobject_list",
        {
            description:
                "List all standard and custom objects in a Salesforce Org. This command retrieves a list of all standard and custom objects available in the specified Salesforce Org. The results are returned in JSON format, providing details about each object, including its name, label, and other metadata. Use this command to explore the objects in your Salesforce Org and understand their structure and properties, especially if asked to work with specific objects in your Apex code or SOQL queries and you don't know their API names. Always execute this tool before writing Apex code or SOQL queries to ensure you have the correct object names.",
            inputSchema: {
                input: z.object({
                    targetOrg: z
                        .string()
                        .optional()
                        .describe(
                            "Target Salesforce Org Alias to execute the code against. If not provided, uses the default org from SF CLI configuration.",
                        ),
                }),
            },
            outputSchema: {
                targetOrg: z.string(),
                sobjects: z.array(z.string()),
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
                    isError: true,
                };
            }

            // Check org permissions
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
                    isError: true,
                };
            }

            const result = await executeSobjectList(targetOrg);
            const structuredContent = {
                targetOrg,
                sobjects: result.result as string[],
            };
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ targetOrg, ...result }),
                    },
                ],
                structuredContent,
            };
        },
    );

    server.registerTool(
        "sobject_describe",
        {
            description:
                "Describe a Salesforce SObject. This command retrieves detailed metadata about a specific Salesforce SObject, including its fields, relationships, and other properties. The results are returned in JSON format, providing a comprehensive view of the SObject's structure. Use this command to understand the schema of a specific SObject, which is especially useful when writing Apex code or SOQL queries that interact with that SObject. Always execute this tool before querying or manipulating records in the SObject to ensure you have the correct field names and types.",
            inputSchema: {
                input: z.object({
                    targetOrg: z
                        .string()
                        .optional()
                        .describe(
                            "Target Salesforce Org Alias to execute the code against. If not provided, uses the default org from SF CLI configuration.",
                        ),
                    sObjectName: z
                        .string()
                        .describe("Name of the SObject to describe"),
                }),
            },
            outputSchema: {
                targetOrg: z.string(),
                name: z.string(),
                label: z.string(),
                keyPrefix: z.string().nullable(),
                custom: z.boolean(),
                queryable: z.boolean(),
                fields: z.array(
                    z.object({
                        name: z.string(),
                        label: z.string(),
                        type: z.string(),
                        length: z.number(),
                        nillable: z.boolean(),
                        custom: z.boolean(),
                        updateable: z.boolean(),
                        createable: z.boolean(),
                        referenceTo: z.array(z.string()),
                        relationshipName: z.string().nullable(),
                    }),
                ),
                childRelationships: z.array(
                    z.object({
                        childSObject: z.string(),
                        field: z.string(),
                        relationshipName: z.string().nullable(),
                    }),
                ),
                recordTypeInfos: z.array(
                    z.object({
                        name: z.string(),
                        recordTypeId: z.string(),
                        active: z.boolean(),
                        available: z.boolean(),
                        defaultRecordTypeMapping: z.boolean(),
                        developerName: z.string(),
                    }),
                ),
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
                    isError: true,
                };
            }

            const { sObjectName } = input;

            // Check org permissions
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
                    isError: true,
                };
            }

            const result = await executeSObjectDescribe(targetOrg, sObjectName);
            const describe = result.result as any;
            const structuredContent = {
                targetOrg,
                name: describe.name,
                label: describe.label,
                keyPrefix: describe.keyPrefix ?? null,
                custom: describe.custom,
                queryable: describe.queryable,
                fields: (describe.fields || []).map((f: any) => ({
                    name: f.name,
                    label: f.label,
                    type: f.type,
                    length: f.length,
                    nillable: f.nillable,
                    custom: f.custom,
                    updateable: f.updateable,
                    createable: f.createable,
                    referenceTo: f.referenceTo || [],
                    relationshipName: f.relationshipName ?? null,
                })),
                childRelationships: (describe.childRelationships || []).map(
                    (r: any) => ({
                        childSObject: r.childSObject,
                        field: r.field,
                        relationshipName: r.relationshipName ?? null,
                    }),
                ),
                recordTypeInfos: (describe.recordTypeInfos || []).map(
                    (rt: any) => ({
                        name: rt.name,
                        recordTypeId: rt.recordTypeId,
                        active: rt.active,
                        available: rt.available,
                        defaultRecordTypeMapping: rt.defaultRecordTypeMapping,
                        developerName: rt.developerName,
                    }),
                ),
            };
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ targetOrg, ...result }),
                    },
                ],
                structuredContent,
            };
        },
    );
};
