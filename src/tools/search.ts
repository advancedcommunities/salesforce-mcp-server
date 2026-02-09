import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeSfCommandRaw } from "../utils/sfCommand.js";
import { permissions } from "../config/permissions.js";
import { resolveTargetOrg } from "../utils/resolveTargetOrg.js";

const executeSoslQuery = async (
    targetOrg: string,
    query?: string,
    file?: string,
    resultFormat: string = "json",
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
        "Search for text across multiple Salesforce objects simultaneously. USE THIS TOOL when searching for records that mention, contain, or reference specific text (like company names, keywords, phrases) across different objects. This is the PRIMARY tool for text-based searches across your org - it's much more efficient than running multiple SOQL queries. Perfect for finding all records mentioning a competitor, customer name, or any text across Accounts, Opportunities, Cases, Contacts, etc. SOSL (Salesforce Object Search Language) performs full-text search across all searchable fields.",
        {
            input: z
                .object({
                    targetOrg: z
                        .string()
                        .optional()
                        .describe(
                            "Username or alias of the target org. If not provided, uses the default org from SF CLI configuration.",
                        ),
                    query: z
                        .string()
                        .optional()
                        .describe(
                            'SOSL query to execute (e.g., "FIND {Anna Jones} IN Name Fields RETURNING Contact (Name, Phone)")',
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
                            "Format to display the results. 'csv' writes to disk, 'human' and 'json' display to terminal",
                        ),
                })
                .refine(
                    (data) =>
                        !!(data.query || data.file) &&
                        !(data.query && data.file),
                    {
                        message:
                            "Provide either 'query' or 'file', but not both",
                    },
                ),
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

            const { query, file, resultFormat } = input;

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
                    resultFormat,
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
                                success: false,
                                error:
                                    error.message ||
                                    "Failed to execute SOSL search",
                            }),
                        },
                    ],
                };
            }
        },
    );
};
