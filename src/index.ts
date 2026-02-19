#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerApexTools } from "./tools/apex.js";
import { registerOrgTools } from "./tools/orgs.js";
import { registerOrgTools as registerRecordTools } from "./tools/records.js";
import { registerSObjectTools } from "./tools/sobjects.js";
import { registerQueryTools } from "./tools/query.js";
import { registerAdminTools } from "./tools/admin.js";
import { registerCodeAnalyzerTools } from "./tools/code-analyzer.js";
import { registerScannerTools } from "./tools/scanner.js";
import { registerPackageTools } from "./tools/package.js";
import { registerSchemaTools } from "./tools/schema.js";
import { registerSearchTools } from "./tools/search.js";
import { registerLightningTools } from "./tools/lightning.js";
import { registerProjectTools } from "./tools/project.js";
import { registerSkillTools } from "./tools/skill.js";
import { registerResources } from "./resources/resources.js";
import { registerPrompts } from "./prompts/prompts.js";
import { permissions } from "./config/permissions.js";
import { initLogger, logger } from "./utils/logger.js";
import { initElicitation } from "./utils/elicitation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadServerIcon(): string | undefined {
    const iconPath = join(__dirname, "..", "icon.png");
    if (!existsSync(iconPath)) return undefined;
    const iconData = readFileSync(iconPath);
    return `data:image/png;base64,${iconData.toString("base64")}`;
}

/**
 * Builds a dynamic server description based on current permissions and capabilities
 * @returns Formatted description string with server details
 */
function buildServerDescription(): string {
    const readOnlyMode = permissions.isReadOnly();
    const allowedOrgs = permissions.getAllowedOrgs();
    const permissionInfo = [];

    let description = `Salesforce MCP Server v1.6.4 - AI-powered Salesforce automation via CLI integration\n`;
    description += `Capabilities: Apex execution, SOQL queries, org management, code testing & coverage\n`;

    if (readOnlyMode) {
        permissionInfo.push("READ-ONLY mode (Apex execution disabled)");
    }

    if (allowedOrgs !== "ALL") {
        permissionInfo.push(`Access restricted to: ${allowedOrgs.join(", ")}`);
    }

    if (permissionInfo.length > 0) {
        description += `Security: ${permissionInfo.join(" | ")}`;
    } else {
        description += `Security: Full access enabled for all authenticated orgs`;
    }

    description += `\nTools: 40 available (apex, query, search, sobject, org management, records, admin, code analyzer, scanner, package, schema, lightning, project deployment, skill)`;
    description += `\nResources: 5 available (permissions, org metadata, objects, object schema, limits)`;
    description += `\nPrompts: 5 available (soql_builder, apex_review, org_health_check, deploy_checklist, debug_apex)`;

    return description;
}

const iconSrc = loadServerIcon();

const server = new McpServer(
    {
        name: "salesforce-mcp-server",
        title: "Salesforce MCP Server",
        version: "1.6.4",
        description: buildServerDescription(),
        ...(iconSrc && {
            icons: [
                {
                    src: iconSrc,
                    mimeType: "image/png",
                    sizes: ["512x512"],
                },
            ],
        }),
    },
    { capabilities: { logging: {} } },
);

initLogger(server);
initElicitation(server);

registerApexTools(server);
registerOrgTools(server);
registerRecordTools(server);
registerSObjectTools(server);
registerQueryTools(server);
registerAdminTools(server);
registerCodeAnalyzerTools(server);
registerScannerTools(server);
registerPackageTools(server);
registerSchemaTools(server);
registerSearchTools(server);
registerLightningTools(server);
registerProjectTools(server);
registerSkillTools(server);
registerResources(server);
registerPrompts(server);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Wrap the transport's onmessage to normalize tool call arguments.
    // Some MCP clients send undefined (no arguments) or stringified JSON
    // instead of a proper object, which fails Zod schema validation.
    const originalOnMessage = transport.onmessage;
    if (originalOnMessage) {
        transport.onmessage = (message: any) => {
            if (
                "method" in message &&
                message.method === "tools/call" &&
                message.params
            ) {
                const params = message.params as Record<string, unknown>;
                if (
                    params.arguments === undefined ||
                    params.arguments === null
                ) {
                    params.arguments = {};
                } else if (typeof params.arguments === "string") {
                    try {
                        params.arguments = JSON.parse(
                            params.arguments as string,
                        );
                    } catch {
                        // leave as-is, let the SDK report the validation error
                    }
                }
            }
            return originalOnMessage(message);
        };
    }

    logger.info("salesforce", "Salesforce MCP Server v1.6.4 started");
    console.error("Salesforce MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
