import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeSfCommandRaw } from "../utils/sfCommand.js";
import { permissions } from "../config/permissions.js";

const executeSoslQuery = async (
    targetOrg: string,
    query?: string,
    file?: string,
    resultFormat: string = "json"
) => {
    let sfCommand: string;

    if (query) {
        sfCommand = `sf data search --target-org ${targetOrg} --query "${query}" --result-format ${resultFormat}`;
    } else if (file) {
        sfCommand = `sf data search --target-org ${targetOrg} --file "${file}" --result-format ${resultFormat}`;
    } else {
        throw new Error("Either query or file must be provided");
    }

    try {
        const result = await executeSfCommandRaw(sfCommand);

        if (resultFormat === "json") {
            try {
                return JSON.parse(result);
            } catch (parseError) {
                return { searchRecords: [], rawOutput: result };
            }
        }

        if (resultFormat === "csv") {
            return {
                success: true,
                message: "Results written to CSV files",
                output: result,
            };
        }

        return { output: result };
    } catch (error) {
        throw error;
    }
};

export const registerSearchTools = (server: McpServer) => {
    server.tool(
        "search_records",
        "Execute a SOSL text-based search query in Salesforce. SOSL (Salesforce Object Search Language) allows you to search text across multiple objects and fields simultaneously. This is useful for finding records that contain specific text across your Salesforce org.",
        {
            input: z
                .object({
                    targetOrg: z
                        .string()
                        .describe(
                            "Username or alias of the target org. Not required if the 'target-org' configuration variable is already set."
                        ),
                    query: z
                        .string()
                        .optional()
                        .describe(
                            'SOSL query to execute (e.g., "FIND {Anna Jones} IN Name Fields RETURNING Contact (Name, Phone)")'
                        ),
                    file: z
                        .string()
                        .optional()
                        .describe("Path to file that contains the SOSL query"),
                    resultFormat: z
                        .enum(["human", "csv", "json"])
                        .optional()
                        .default("json")
                        .describe(
                            "Format to display the results. 'csv' writes to disk, 'human' and 'json' display to terminal"
                        ),
                })
                .refine(
                    (data) =>
                        !!(data.query || data.file) &&
                        !(data.query && data.file),
                    {
                        message:
                            "Provide either 'query' or 'file', but not both",
                    }
                ),
        },
        async ({ input }) => {
            const { targetOrg, query, file, resultFormat } = input;

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

            try {
                const result = await executeSoslQuery(
                    targetOrg,
                    query,
                    file,
                    resultFormat
                );

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result),
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
                                error:
                                    error.message ||
                                    "Failed to execute SOSL search",
                            }),
                        },
                    ],
                };
            }
        }
    );
};
