import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { permissions } from "../config/permissions.js";
import { executeSfCommand } from "../utils/sfCommand.js";
import z from "zod";

const schemaGenerateFieldInputSchema = z.object({
    targetOrg: z.string().describe("Target Salesforce Org Alias"),
    label: z.string().describe("The field's label"),
    object: z
        .string()
        .optional()
        .describe(
            "The directory that contains the object's source files (e.g., force-app/main/default/objects/Account or force-app/main/default/objects/MyObject__c)",
        ),
});

const schemaGenerateField = async (
    input: z.infer<typeof schemaGenerateFieldInputSchema>,
) => {
    const { targetOrg, label, object } = input;

    if (!permissions.isOrgAllowed(targetOrg)) {
        return {
            error: `Access denied: Organization '${targetOrg}' is not in the allowed list`,
        };
    }

    if (permissions.isReadOnly()) {
        return {
            error: "Operation not permitted in read-only mode",
        };
    }

    try {
        let sfCommand = `sf schema generate field --label "${label}"`;

        if (object) {
            sfCommand += ` --object "${object}"`;
        }

        sfCommand += ` --target-org ${targetOrg} --json`;

        const result = await executeSfCommand(sfCommand);
        return { result };
    } catch (error: any) {
        return {
            error: error.message || "Failed to generate field",
        };
    }
};

const schemaGenerateSObjectInputSchema = z.object({
    targetOrg: z.string().describe("Target Salesforce Org Alias"),
    label: z.string().describe("The custom object's label"),
    useDefaultFeatures: z
        .boolean()
        .optional()
        .describe(
            "Enable all optional features without prompting (Search, Feeds, Reports, History, Activities, Bulk API, Sharing, Streaming API)",
        ),
});

const schemaGenerateSObject = async (
    input: z.infer<typeof schemaGenerateSObjectInputSchema>,
) => {
    const { targetOrg, label, useDefaultFeatures } = input;

    if (!permissions.isOrgAllowed(targetOrg)) {
        return {
            error: `Access denied: Organization '${targetOrg}' is not in the allowed list`,
        };
    }

    if (permissions.isReadOnly()) {
        return {
            error: "Operation not permitted in read-only mode",
        };
    }

    try {
        let sfCommand = `sf schema generate sobject --label "${label}"`;

        if (useDefaultFeatures) {
            sfCommand += " --use-default-features";
        }

        sfCommand += ` --target-org ${targetOrg} --json`;

        const result = await executeSfCommand(sfCommand);
        return { result };
    } catch (error: any) {
        return {
            error: error.message || "Failed to generate custom object",
        };
    }
};

const schemaGenerateTabInputSchema = z.object({
    targetOrg: z.string().describe("Target Salesforce Org Alias"),
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
    const { targetOrg, object, directory, icon } = input;

    if (!permissions.isOrgAllowed(targetOrg)) {
        return {
            error: `Access denied: Organization '${targetOrg}' is not in the allowed list`,
        };
    }

    if (permissions.isReadOnly()) {
        return {
            error: "Operation not permitted in read-only mode",
        };
    }

    try {
        let sfCommand = `sf schema generate tab --object "${object}" --directory "${directory}" --icon ${icon}`;
        sfCommand += ` --target-org ${targetOrg} --json`;

        const result = await executeSfCommand(sfCommand);
        return { result };
    } catch (error: any) {
        return {
            error: error.message || "Failed to generate tab",
        };
    }
};

export const registerSchemaTools = (server: McpServer) => {
    server.tool(
        "schema_generate_field",
        "Generate metadata source files for a new custom field on a specified object. This command must be run in a Salesforce DX project directory with existing object source files.",
        {
            input: schemaGenerateFieldInputSchema,
        },
        async ({ input }) => {
            const result = await schemaGenerateField(input);
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

    server.tool(
        "schema_generate_sobject",
        "Generate metadata source files for a new custom object. This command must be run in a Salesforce DX project directory. The command is interactive and will prompt for Name field details.",
        {
            input: schemaGenerateSObjectInputSchema,
        },
        async ({ input }) => {
            const result = await schemaGenerateSObject(input);
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

    server.tool(
        "schema_generate_tab",
        "Generate metadata source files for a new custom tab on a custom object. Custom tabs display custom object data in Salesforce navigation.",
        {
            input: schemaGenerateTabInputSchema,
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
