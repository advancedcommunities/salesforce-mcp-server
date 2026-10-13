import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ElicitResult } from "@modelcontextprotocol/sdk/types.js";

let serverInstance: McpServer | null = null;

export function initElicitation(server: McpServer): void {
    serverInstance = server;
}

/**
 * Whether the connected client can show an elicitation prompt. Clients that
 * cannot (such as Claude Cowork, which gates tool calls with its own approval
 * UI) return false, and tools use their documented non-prompt path instead.
 */
export function canElicit(): boolean {
    if (!serverInstance) return false;
    return !!serverInstance.server.getClientCapabilities()?.elicitation;
}

async function elicit(
    message: string,
): Promise<{ confirmed: boolean; message?: string }> {
    const result: ElicitResult = await serverInstance!.server.elicitInput({
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
}

/**
 * Asks the user to confirm. Fails open: when the client cannot show a prompt,
 * or the prompt errors, the operation proceeds. Used by tools where the
 * description only promises a best-effort confirmation.
 */
export async function requestConfirmation(
    message: string,
): Promise<{ confirmed: boolean; message?: string }> {
    if (!canElicit()) return { confirmed: true };
    try {
        return await elicit(message);
    } catch {
        return { confirmed: true };
    }
}

/**
 * Prompts the user and fails closed: only an accepted "yes" returns confirmed.
 * Decline, cancel and a failed prompt all block the operation. Callers must
 * check canElicit() first; the prompt is not shown otherwise.
 */
export async function requireUserConfirmation(
    message: string,
): Promise<{ confirmed: boolean; message?: string }> {
    try {
        return await elicit(message);
    } catch {
        return {
            confirmed: false,
            message:
                "Confirmation could not be obtained, so the operation was not run.",
        };
    }
}
