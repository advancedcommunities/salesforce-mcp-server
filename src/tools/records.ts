import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { permissions } from "../config/permissions.js";
import { getOrgInfo } from "../shared/connection.js";
import { exec } from "node:child_process";
import { platform } from "node:os";
import z from "zod";

const openRecordInBrowser = async (targetOrg: string, recordId: string) => {
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
        default: // linux and other unix-like systems
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
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: "Target org is required",
                            }),
                        },
                    ],
                };
            }

            if (!recordId || recordId.trim() === "") {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: "Salesforce record Id is required",
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
                                message: `Access to org '${targetOrg}' is not allowed`,
                            }),
                        },
                    ],
                };
            }

            try {
                const result = await openRecordInBrowser(targetOrg, recordId);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result),
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    error instanceof Error
                                        ? error.message
                                        : "Failed to open record in browser",
                            }),
                        },
                    ],
                };
            }
        }
    );
};
