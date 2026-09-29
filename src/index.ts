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
import { applySchemaDialectFix } from "./utils/schemaDialect.js";
import { buildBrowserInstructions } from "./utils/clientBrowser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Single source of truth for the server version; keep in sync with package.json */
const SERVER_VERSION = "1.6.7";

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

    let description = `Salesforce MCP Server v${SERVER_VERSION} - AI-powered Salesforce automation via CLI integration\n`;
    description += `Capabilities: Apex execution, SOQL queries, org management, code testing & coverage\n`;

    if (readOnlyMode) {
        permissionInfo.push("READ-ONLY mode (Apex execution disabled)");
    }

    if (allowedOrgs !== "ALL") {
        permissionInfo.push(`Access restricted to: ${allowedOrgs.join(", ")}`);
    }

    if (permissions.usesClientBrowser()) {
        permissionInfo.push(
            "Client browser mode (org/record URLs handed to the client's built-in browser)",
        );
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
        version: SERVER_VERSION,
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
    {
        capabilities: { logging: {} },
        // Surfaced to the client at initialize and typically injected into the
        // assistant's system prompt, so it knows how org URLs should be opened.
        instructions: buildBrowserInstructions(),
    },
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

    // Advertise tool schemas with the JSON Schema 2020-12 dialect instead of
    // the draft-07 one the SDK emits, which 2020-12-only clients reject.
    applySchemaDialectFix(transport);

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

    const browserMode = permissions.usesClientBrowser()
        ? "client's built-in browser"
        : "system browser";

    logger.info(
        "salesforce",
        `Salesforce MCP Server v${SERVER_VERSION} started (org URLs open in: ${browserMode})`,
    );
    console.error(
        `Salesforce MCP Server running on stdio (org URLs open in: ${browserMode})`,
    );
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
