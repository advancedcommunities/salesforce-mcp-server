import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { permissions } from "../config/permissions.js";
import { executeSfCommand } from "../utils/sfCommand.js";
import z from "zod";

const schemaGenerateTabInputSchema = z.object({
    object: z
        .string()
        .describe("API name of the custom object (e.g., MyObject__c)"),
    directory: z
        .string()
        .describe(
            "Path to a 'tabs' directory that will contain the source files",
        ),
    icon: z
        .number()
        .min(1)
        .max(100)
        .default(1)
        .describe(
            "Number from 1 to 100 that specifies the color scheme and icon for the custom tab",
        ),
});

const schemaGenerateTab = async (
    input: z.infer<typeof schemaGenerateTabInputSchema>,
) => {
    const { object, directory, icon } = input;

    if (permissions.isReadOnly()) {
        return {
            error: "Operation not permitted in read-only mode",
        };
    }

    try {
        let sfCommand = `sf schema generate tab --object "${object}" --directory "${directory}" --icon ${icon}`;

        const result = await executeSfCommand(sfCommand);
        return { result };
    } catch (error: any) {
        return {
            error: error.message || "Failed to generate tab",
        };
    }
};

export const registerSchemaTools = (server: McpServer) => {
    server.registerTool(
        "schema_generate_tab",
        {
            description:
                "Generate metadata source files for a new custom tab on a custom object. Custom tabs display custom object data in Salesforce navigation.",
            inputSchema: {
                input: schemaGenerateTabInputSchema,
            },
            annotations: {
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: false,
                openWorldHint: true,
            },
        },
        async ({ input }) => {
            const result = await schemaGenerateTab(input);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result),
                    },
                ],
            };
        },
    );
};
