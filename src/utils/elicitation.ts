import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ElicitResult } from "@modelcontextprotocol/sdk/types.js";

let serverInstance: McpServer | null = null;

export function initElicitation(server: McpServer): void {
    serverInstance = server;
}

export async function requestConfirmation(
    message: string,
): Promise<{ confirmed: boolean; message?: string }> {
    if (!serverInstance) return { confirmed: true };

    const capabilities = serverInstance.server.getClientCapabilities();
    if (!capabilities?.elicitation) return { confirmed: true };

    try {
        const result: ElicitResult = await serverInstance.server.elicitInput({
            message,
            requestedSchema: {
                type: "object",
                properties: {
                    confirm: {
                        type: "boolean",
                        title: "Confirm",
                        description: message,
                        default: false,
                    },
                },
                required: ["confirm"],
            },
        });

        if (result.action === "accept" && result.content?.confirm === true) {
            return { confirmed: true };
        }
        if (result.action === "decline") {
            return { confirmed: false, message: "Operation declined by user" };
        }
        return { confirmed: false, message: "Operation cancelled by user" };
    } catch {
        return { confirmed: true };
    }
}
