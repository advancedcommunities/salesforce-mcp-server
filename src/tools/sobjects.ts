import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeSfCommand } from "../utils/sfCommand.js";
import { permissions } from "../config/permissions.js";

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
    sObjectName: string
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
    server.tool(
        "sobject_list",
        "List all standard and custom objects in a Salesforce Org. This command retrieves a list of all standard and custom objects available in the specified Salesforce Org. The results are returned in JSON format, providing details about each object, including its name, label, and other metadata. Use this command to explore the objects in your Salesforce Org and understand their structure and properties, especially if asked to work with specific objects in your Apex code or SOQL queries and you don't know their API names. Always execute this tool before writing Apex code or SOQL queries to ensure you have the correct object names.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .describe(
                        "Target Salesforce Org Alias to execute the code against"
                    ),
            }),
        },
        async ({ input }) => {
            const { targetOrg } = input;
            
            // Check org permissions
            if (!permissions.isOrgAllowed(targetOrg)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: `Access denied: Org '${targetOrg}' is not in the allowed list`
                            }),
                        },
                    ],
                };
            }
            
            const result = await executeSobjectList(targetOrg);
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
        "sobject_describe",
        "Describe a Salesforce SObject. This command retrieves detailed metadata about a specific Salesforce SObject, including its fields, relationships, and other properties. The results are returned in JSON format, providing a comprehensive view of the SObject's structure. Use this command to understand the schema of a specific SObject, which is especially useful when writing Apex code or SOQL queries that interact with that SObject. Always execute this tool before querying or manipulating records in the SObject to ensure you have the correct field names and types.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .describe(
                        "Target Salesforce Org Alias to execute the code against"
                    ),
                sObjectName: z.string().describe("Name of the SObject to describe"),
            }),
        },
        async ({ input }) => {
            const { targetOrg, sObjectName } = input;
            
            // Check org permissions
            if (!permissions.isOrgAllowed(targetOrg)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: `Access denied: Org '${targetOrg}' is not in the allowed list`
                            }),
                        },
                    ],
                };
            }
            
            const result = await executeSObjectDescribe(targetOrg, sObjectName);
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