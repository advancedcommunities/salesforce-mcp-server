import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getConnection } from "../shared/connection.js";
import { permissions } from "../config/permissions.js";
import { executeSfCommand, executeSfCommandRaw } from "../utils/sfCommand.js";

const generateComponent = async (
    name: string,
    template: string,
    outputDirectory: string,
    type: string,
) => {
    let sfCommand = `sf lightning generate component --name ${name} --json `;

    if (template && template.length > 0) {
        sfCommand += `--template ${template} `;
    }

    if (outputDirectory && outputDirectory.length > 0) {
        sfCommand += `--output-dir ${outputDirectory} `;
    }

    if (type && type.length > 0) {
        sfCommand += `--type ${type}`;
    }

    try {
        const result = await executeSfCommand(sfCommand);
        return result;
    } catch (error) {
        throw error;
    }
};

export const registerLightningTools = (server: McpServer) => {
    server.registerTool(
        "generate_component",
        {
            description:
                "Generate Lightning Web Components (LWC) or Aura components with customizable templates and output directories",
            inputSchema: {
                input: z.object({
                    name: z
                        .string()
                        .describe(
                            "Name of the generated Lightning Component. The name can be up to 40 characters and must start with a letter.",
                        ),
                    template: z
                        .string()
                        .optional()
                        .describe(
                            "Template to use for file creation. Supplied parameter values or default values are filled into a copy of the template. Permissible values are: default, analyticsDashboard, analyticsDashboardWithStep. Default value: default",
                        ),
                    outputDirectory: z
                        .string()
                        .optional()
                        .describe(
                            "Directory for saving the created files. The location can be an absolute path or relative to the current working directory. The default is the current directory. Default value: .",
                        ),
                    type: z
                        .string()
                        .optional()
                        .describe(
                            "Type of the component bundle. Permissible values are: aura, lwc (lightning web component). Default value: aura",
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
            const { name, template, outputDirectory, type } = input;
            const DEFAULT_OUTPUT = ".";
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

            const result = await generateComponent(
                name,
                template || "",
                outputDirectory || DEFAULT_OUTPUT,
                type || "",
            );
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
