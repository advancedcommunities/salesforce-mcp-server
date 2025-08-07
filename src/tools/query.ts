import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeSfCommand } from "../utils/sfCommand.js";
import { permissions } from "../config/permissions.js";

const executeSoqlQuery = async (
    targetOrg: string,
    sObject: string,
    selectClause: string,
    where?: string,
    limit?: number,
    orderBy?: string
) => {
    let query = `SELECT ${selectClause} FROM ${sObject}`;

    if (where) query += " WHERE " + where;
    if (orderBy) query += " ORDER BY " + orderBy;
    if (limit) query += " LIMIT " + limit;

    const sfCommand = `sf data query --target-org ${targetOrg} --query "${query}" --json`;

    try {
        const result = await executeSfCommand(sfCommand);
        return result.result.records || [];
    } catch (error) {
        throw error;
    }
};

const executeSoqlQueryToFile = async (
    targetOrg: string,
    sObject: string,
    selectClause: string,
    where?: string,
    outputFileName?: string,
    outputFileFormat: "csv" | "json" = "csv",
    orderBy?: string
) => {
    let query = `SELECT ${selectClause} FROM ${sObject}`;

    if (where) query += " WHERE " + where;
    if (orderBy) query += " ORDER BY " + orderBy;

    const sfCommand = `sf data export bulk --query "${query}" --target-org ${targetOrg} --output-file "${
        outputFileName || "output"
    }" --result-format ${outputFileFormat} --json -w 30`;

    try {
        const result = await executeSfCommand(sfCommand);
        return result.result;
    } catch (error) {
        throw error;
    }
};

export const registerQueryTools = (server: McpServer) => {
    server.tool(
        "query_records",
        "Query records from a Salesforce SObject. This command allows you to execute a SOQL query against a specified Salesforce SObject in a given Org. You can specify the SELECT clause (fields, functions like COUNT(), aggregations, etc.), an optional WHERE clause, and an optional limit on the number of records returned. The results are returned in JSON format, making it easy to work with the data in your application or script.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .describe(
                        "Target Salesforce Org to execute the query against"
                    ),
                sObject: z
                    .string()
                    .describe("Salesforce SObject to query from"),
                selectClause: z
                    .string()
                    .describe(
                        "SELECT clause content - can include fields, functions (COUNT, SUM, AVG, etc.), expressions, and aliases"
                    ),
                where: z
                    .string()
                    .optional()
                    .describe("Optional WHERE clause for the query"),

                limit: z
                    .number()
                    .optional()
                    .describe(
                        "Optional limit for the number of records returned"
                    ),
                orderBy: z
                    .string()
                    .optional()
                    .describe(
                        "Optional ORDER BY clause for sorting results (e.g., 'Name ASC', 'CreatedDate DESC')"
                    ),
            }),
        },
        async ({ input }) => {
            const { targetOrg, sObject, selectClause, where, limit, orderBy } = input;

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
                };
            }

            const result = await executeSoqlQuery(
                targetOrg,
                sObject,
                selectClause,
                where,
                limit,
                orderBy
            );

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
        "query_records_to_file",
        "Query records from a Salesforce SObject and save to a file. This command allows you to execute a SOQL query against a specified Salesforce SObject in a given Org and save the results to a file. You can specify the SELECT clause (fields, functions like COUNT(), aggregations, etc.), an optional WHERE clause, and save the results in various formats. The results can be saved in CSV format by default, or in other formats if specified.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .describe(
                        "Target Salesforce Org to execute the query against"
                    ),
                sObject: z
                    .string()
                    .describe("Salesforce SObject to query from"),
                selectClause: z
                    .string()
                    .describe(
                        "SELECT clause content - can include fields, functions (COUNT, SUM, AVG, etc.), expressions, and aliases"
                    ),
                where: z
                    .string()
                    .optional()
                    .describe("Optional WHERE clause for the query"),
                outputFileName: z
                    .string()
                    .optional()
                    .describe("Optional output file name to save the results"),
                outputFileFormat: z
                    .enum(["csv", "json"])
                    .optional()
                    .default("csv")
                    .describe(
                        "Optional output file format to save the results, default is csv"
                    ),
                orderBy: z
                    .string()
                    .optional()
                    .describe(
                        "Optional ORDER BY clause for sorting results (e.g., 'Name ASC', 'CreatedDate DESC')"
                    ),
            }),
        },
        async ({ input }) => {
            const {
                targetOrg,
                sObject,
                selectClause,
                where,
                outputFileName,
                outputFileFormat,
                orderBy,
            } = input;

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
                };
            }

            const result = await executeSoqlQueryToFile(
                targetOrg,
                sObject,
                selectClause,
                where,
                outputFileName,
                outputFileFormat as "csv" | "json",
                orderBy
            );

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
