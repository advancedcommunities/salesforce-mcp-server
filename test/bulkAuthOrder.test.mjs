// Run: npm test (builds first, then runs this file against build/)
// READ_ONLY and ALLOWED_ORGS are read once when the permissions module loads,
// so they are set here before the dynamic imports. This file is its own
// process under node --test, so other test files keep the defaults.
process.env.READ_ONLY = "true";
process.env.ALLOWED_ORGS = "allowed-alias";

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const { registerBulkTools } = await import("../build/tools/bulk.js");
const { initElicitation } = await import("../build/utils/elicitation.js");

const READ_ONLY_MESSAGE =
    "Cannot run Bulk API write operations: Server is in read-only mode";

const connect = async () => {
    const server = new McpServer({ name: "bulk-auth-test", version: "0.0.0" });
    registerBulkTools(server);
    initElicitation(server);
    const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client(
        { name: "bulk-auth-test-client", version: "0.0.0" },
        { capabilities: {} },
    );
    await client.connect(clientTransport);
    return { client, close: () => client.close() };
};

const call = async (client, name, input) => {
    const result = await client.callTool({ name, arguments: { input } });
    return JSON.parse(result.content[0].text);
};

/** A file that fails CSV scanning: a header with no data rows. */
const headerOnlyCsv = () => {
    const dir = mkdtempSync(join(tmpdir(), "bulk-auth-"));
    const path = join(dir, "header-only.csv");
    writeFileSync(path, "Id,Name\n");
    return {
        path,
        cleanup: () => rmSync(dir, { recursive: true, force: true }),
    };
};

test("a write to a disallowed org is refused before the csvPath file is read", async () => {
    const file = headerOnlyCsv();
    const { client, close } = await connect();
    try {
        const out = await call(client, "bulk_update_records", {
            targetOrg: "other-alias",
            sobject: "Account",
            csvPath: file.path,
        });
        assert.equal(out.success, false);
        assert.match(out.message, /Access to org 'other-alias' is not allowed/);
    } finally {
        await close();
        file.cleanup();
    }
});

test("a write in read-only mode is refused before the csvPath file is read", async () => {
    const file = headerOnlyCsv();
    const { client, close } = await connect();
    try {
        for (const tool of ["bulk_insert_records", "bulk_update_records"]) {
            const out = await call(client, tool, {
                targetOrg: "allowed-alias",
                sobject: "Account",
                csvPath: file.path,
            });
            assert.equal(out.success, false, tool);
            assert.equal(out.message, READ_ONLY_MESSAGE, tool);
        }
    } finally {
        await close();
        file.cleanup();
    }
});
