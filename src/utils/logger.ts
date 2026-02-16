import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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
    serverInstance
        .sendLoggingMessage({ level, logger: loggerName, data })
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
