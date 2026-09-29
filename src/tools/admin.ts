import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { permissions } from "../config/permissions.js";
import { getDefaultOrgForClient } from "../utils/resolveTargetOrg.js";
import { maskOrgReference } from "../utils/maskIdentifiers.js";

export const registerAdminTools = (server: McpServer) => {
    server.registerTool(
        "get_server_permissions",
        {
            description: "Get current server permission settings",
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async () => {
            const rawAllowedOrgs = permissions.getAllowedOrgs();
            const allowedOrgs =
                rawAllowedOrgs === "ALL"
                    ? rawAllowedOrgs
                    : rawAllowedOrgs.map(maskOrgReference);
            // Only the alias (or a masked username) is exposed to the client.
            const { org: defaultOrg } = await getDefaultOrgForClient();
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            readOnly: permissions.isReadOnly(),
                            allowedOrgs: allowedOrgs,
                            useClientBrowser: permissions.usesClientBrowser(),
                            defaultOrg: defaultOrg || "Not configured",
                            message:
                                allowedOrgs === "ALL"
                                    ? "All orgs are allowed"
                                    : `Access restricted to: ${allowedOrgs.join(
                                          ", ",
                                      )}`,
                        }),
                    },
                ],
            };
        },
    );
};
