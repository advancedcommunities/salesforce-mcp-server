import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { permissions } from "../config/permissions.js";

export const registerAdminTools = (server: McpServer) => {
    server.tool(
        "get_server_permissions",
        "Get current server permission settings",
        {},
        async () => {
            const allowedOrgs = permissions.getAllowedOrgs();
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            readOnly: permissions.isReadOnly(),
                            allowedOrgs: allowedOrgs,
                            message:
                                allowedOrgs === "ALL"
                                    ? "All orgs are allowed"
                                    : `Access restricted to: ${allowedOrgs.join(
                                          ", "
                                      )}`,
                        }),
                    },
                ],
            };
        }
    );
};