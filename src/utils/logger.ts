import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { scrubOrgIdentifiers } from "./maskIdentifiers.js";

type LogLevel =
    | "debug"
    | "info"
    | "notice"
    | "warning"
    | "error"
    | "critical"
    | "alert"
    | "emergency";

let serverInstance: McpServer | null = null;

function log(level: LogLevel, loggerName: string, data: unknown): void {
    if (!serverInstance) return;
    // Log messages go to the MCP client, so usernames, org IDs and URLs in
    // them (e.g. a default org's username in a CLI command) are masked.
    const safeData =
        typeof data === "string" ? scrubOrgIdentifiers(data) : data;
    serverInstance
        .sendLoggingMessage({ level, logger: loggerName, data: safeData })
        .catch(() => {});
}

export function initLogger(server: McpServer): void {
    serverInstance = server;
}

export const logger = {
    debug: (name: string, data: unknown) => log("debug", name, data),
    info: (name: string, data: unknown) => log("info", name, data),
    warning: (name: string, data: unknown) => log("warning", name, data),
    error: (name: string, data: unknown) => log("error", name, data),
    critical: (name: string, data: unknown) => log("critical", name, data),
};
