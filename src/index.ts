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
import { permissions } from "./config/permissions.js";

/**
 * Builds a dynamic server description based on current permissions and capabilities
 * @returns Formatted description string with server details
 */
function buildServerDescription(): string {
    const readOnlyMode = permissions.isReadOnly();
    const allowedOrgs = permissions.getAllowedOrgs();
    const permissionInfo = [];

    let description = `Salesforce MCP Server v1.2.3 - AI-powered Salesforce automation via CLI integration\n`;
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

    description += `\nTools: 28 available (apex, query, sobject, org management, records, admin, code analyzer, scanner, package, schema)`;

    return description;
}

const server = new McpServer({
    name: "salesforce-mcp-server",
    version: "1.2.4",
    description: buildServerDescription(),
    capabilities: {
        tools: {},
    },
});

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

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Salesforce MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
