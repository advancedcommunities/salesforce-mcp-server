// Run: npm test (builds first, then runs this file against build/)
// Tool-level checks that never reach an org: each refusal happens before the
// org lookup, so these tests cannot write to any org.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { describeJobFailure, registerBulkTools } from "../build/tools/bulk.js";
import { initElicitation } from "../build/utils/elicitation.js";
import {
    createStdioTransport,
    STDIO_MAX_BUFFER_BYTES,
} from "../build/utils/stdioTransport.js";

const MIB = 1024 * 1024;

/**
 * Connects a client to the bulk tools. Without onElicit the client does not
 * advertise elicitation (like Claude Cowork). With it, the client advertises
 * elicitation and answers prompts with onElicit.
 */
const connect = async ({ onElicit } = {}) => {
    const server = new McpServer({ name: "bulk-test", version: "0.0.0" });
    registerBulkTools(server);
    initElicitation(server);
    const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client(
        { name: "bulk-test-client", version: "0.0.0" },
        { capabilities: onElicit ? { elicitation: {} } : {} },
    );
    if (onElicit) client.setRequestHandler(ElicitRequestSchema, onElicit);
    await client.connect(clientTransport);
    return { client, close: () => client.close() };
};

const call = async (client, name, input) => {
    const result = await client.callTool({ name, arguments: { input } });
    return JSON.parse(result.content[0].text);
};

const ONE_OF_ERROR = /Provide exactly one of/;

test("every bulk write tool refuses zero or two sources before any org lookup", async () => {
    const { client, close } = await connect();
    try {
        const cases = [
            ["bulk_insert_records", {}],
            ["bulk_update_records", {}],
            ["bulk_upsert_records", { externalIdField: "Ext__c" }],
            ["bulk_delete_records", { confirm: "DELETE Account" }],
            ["bulk_hard_delete_records", { confirm: "HARD DELETE Account" }],
        ];
        for (const [tool, extra] of cases) {
            const base = { sobject: "Account", ...extra };
            const none = await call(client, tool, base);
            assert.equal(none.success, false, tool);
            assert.match(none.message, ONE_OF_ERROR, tool);

            const both = await call(client, tool, {
                ...base,
                csvContent: "Id\n001000000000001AAA\n",
                csvPath: "/tmp/x.csv",
            });
            assert.equal(both.success, false, tool);
            assert.match(both.message, ONE_OF_ERROR, tool);
        }
    } finally {
        await close();
    }
});

test("the exactly-one message names each tool's own sources", async () => {
    const { client, close } = await connect();
    try {
        const insert = await call(client, "bulk_insert_records", {
            sobject: "Account",
        });
        assert.equal(
            insert.message,
            "Provide exactly one of 'records', 'csvPath' or 'csvContent'",
        );
        const del = await call(client, "bulk_delete_records", {
            sobject: "Account",
            confirm: "DELETE Account",
        });
        assert.equal(
            del.message,
            "Provide exactly one of 'ids', 'csvPath' or 'csvContent'",
        );
    } finally {
        await close();
    }
});

test("csvContent just over the inline byte cap returns the byte-limit message", async () => {
    const { client, close } = await connect();
    try {
        const csvContent = `Name\n${"x".repeat(10 * MIB + 1)}\n`;
        const out = await call(client, "bulk_insert_records", {
            sobject: "Account",
            csvContent,
        });
        assert.equal(out.success, false);
        assert.match(out.message, /above the 10485760 byte limit/);
    } finally {
        await close();
    }
});

test("csvContent with mixed line endings is refused before upload", async () => {
    const { client, close } = await connect();
    try {
        const out = await call(client, "bulk_insert_records", {
            sobject: "Account",
            csvContent: "Name,Phone\r\nA,555-1\nB,555-2\n",
        });
        assert.equal(out.success, false);
        assert.match(out.message, /mixes line endings/);
        assert.equal(out.jobId, undefined);
    } finally {
        await close();
    }
});

test("csvContent header names with spaces are refused before upload", async () => {
    const { client, close } = await connect();
    try {
        const out = await call(client, "bulk_update_records", {
            sobject: "Account",
            csvContent: "Id ,Phone\n001000000000001AAA,555\n",
        });
        assert.equal(out.success, false);
        assert.match(out.message, /leading or trailing spaces/);
    } finally {
        await close();
    }
});

test("stdio transport accepts a quote-heavy 10 MiB csvContent line", async () => {
    // Quotes are escaped as \" in JSON, so this line is about 20 MiB.
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const transport = createStdioTransport(stdin, stdout);
    const received = [];
    const errors = [];
    transport.onmessage = (message) => received.push(message);
    transport.onerror = (error) => errors.push(error);
    await transport.start();
    const csvContent = `Name\n${'"'.repeat(10 * MIB)}\n`;
    const line = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
            name: "bulk_insert_records",
            arguments: { input: { csvContent } },
        },
    });
    stdin.write(`${line}\n`);
    const deadline = Date.now() + 10000;
    while (
        received.length === 0 &&
        errors.length === 0 &&
        Date.now() < deadline
    ) {
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await transport.close();
    assert.deepEqual(errors, []);
    assert.equal(received.length, 1);
    assert.equal(received[0].params.arguments.input.csvContent, csvContent);
});

test("the SDK default buffer (10 MiB) is too small for the inline cap, so the server must set its own", async () => {
    // Negative control: the default transport drops a line of this size.
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const transport = new StdioServerTransport(stdin, stdout);
    const errors = [];
    transport.onerror = (error) => errors.push(error);
    await transport.start();
    const line = JSON.stringify({ csvContent: "x".repeat(11 * MIB) });
    stdin.write(`${line}\n`);
    const deadline = Date.now() + 10000;
    while (errors.length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await transport.close();
    assert.match(String(errors[0]?.message), /ReadBuffer exceeded/);
    assert.ok(STDIO_MAX_BUFFER_BYTES >= 6 * 10 * MIB + MIB);
});

/* Delete confirmation. None of these tests reach an org: every case either
 * refuses at the gate or stops at a check that runs before authorization, and
 * the elicitation cases use targetOrg "test-alias", which needs no CLI lookup. */

const RECORD_ID = "001000000000001AAA";
test("soft delete without a client prompt refuses a missing or wrong confirm before any org call", async () => {
    const { client, close } = await connect();
    try {
        const confirms = [
            undefined,
            "",
            "DELETE account",
            "delete Account",
            "DELETE Contact",
            "HARD DELETE Account",
        ];
        for (const confirm of confirms) {
            const out = await call(client, "bulk_delete_records", {
                sobject: "Account",
                ids: [RECORD_ID],
                confirm,
            });
            assert.equal(out.success, false, String(confirm));
            assert.match(out.message, /cannot show a confirmation prompt/);
            assert.match(out.message, /Pass confirm: "DELETE Account"/);
        }
    } finally {
        await close();
    }
});

test("soft delete without a client prompt passes the gate with the exact confirm", async () => {
    const { client, close } = await connect();
    try {
        // An invalid Id fails in input preparation, which runs before any org lookup.
        const out = await call(client, "bulk_delete_records", {
            sobject: "Account",
            ids: ["not-an-id"],
            confirm: "DELETE Account",
        });
        assert.equal(out.success, false);
        assert.match(out.message, /Invalid Salesforce record Id/);
    } finally {
        await close();
    }
});

test("hard delete refuses a missing or wrong confirm with or without a client prompt", async () => {
    let prompts = 0;
    const onElicit = async () => {
        prompts += 1;
        return { action: "accept", content: { confirm: true } };
    };
    for (const options of [{}, { onElicit }]) {
        const { client, close } = await connect(options);
        try {
            for (const confirm of [
                undefined,
                "",
                "HARD DELETE Contact",
                "hard delete Account",
            ]) {
                const out = await call(client, "bulk_hard_delete_records", {
                    sobject: "Account",
                    ids: [RECORD_ID],
                    confirm,
                });
                assert.equal(out.success, false, String(confirm));
                assert.match(out.message, /Hard delete not confirmed/);
                assert.match(
                    out.message,
                    /Pass confirm: "HARD DELETE Account"/,
                );
            }
        } finally {
            await close();
        }
    }
    assert.equal(prompts, 0, "a refused hard delete must not prompt");
});

test("with a client prompt, soft delete asks the user and a decline blocks it, whatever confirm says", async () => {
    let prompts = 0;
    const onElicit = async () => {
        prompts += 1;
        return { action: "decline" };
    };
    const { client, close } = await connect({ onElicit });
    try {
        for (const confirm of [undefined, "junk"]) {
            const out = await call(client, "bulk_delete_records", {
                targetOrg: "test-alias",
                sobject: "Account",
                ids: [RECORD_ID],
                confirm,
            });
            assert.equal(out.success, false);
            assert.equal(out.message, "Operation declined by user");
        }
        assert.equal(prompts, 2);
    } finally {
        await close();
    }
});

test("with a client prompt, a failed prompt blocks soft delete", async () => {
    const onElicit = async () => {
        throw new Error("client cannot render the prompt");
    };
    const { client, close } = await connect({ onElicit });
    try {
        const out = await call(client, "bulk_delete_records", {
            targetOrg: "test-alias",
            sobject: "Account",
            ids: [RECORD_ID],
        });
        assert.equal(out.success, false);
        assert.equal(
            out.message,
            "Confirmation could not be obtained, so the operation was not run.",
        );
    } finally {
        await close();
    }
});

test("with a client prompt, a declined hard delete is blocked after the typed confirm passes", async () => {
    let prompts = 0;
    const onElicit = async () => {
        prompts += 1;
        return { action: "cancel" };
    };
    const { client, close } = await connect({ onElicit });
    try {
        const out = await call(client, "bulk_hard_delete_records", {
            targetOrg: "test-alias",
            sobject: "Account",
            ids: [RECORD_ID],
            confirm: "HARD DELETE Account",
        });
        assert.equal(out.success, false);
        assert.equal(out.message, "Operation cancelled by user");
        assert.equal(prompts, 1);
    } finally {
        await close();
    }
});

test("with a client prompt, a failed prompt blocks update and upsert above 500 rows", async () => {
    let prompts = 0;
    const onElicit = async () => {
        prompts += 1;
        throw new Error("client cannot render the prompt");
    };
    const { client, close } = await connect({ onElicit });
    try {
        const records = Array.from({ length: 501 }, () => ({
            Id: RECORD_ID,
            Name: "x",
        }));
        const update = await call(client, "bulk_update_records", {
            targetOrg: "test-alias",
            sobject: "Account",
            records,
        });
        assert.equal(update.success, false);
        assert.equal(
            update.message,
            "Confirmation could not be obtained, so the operation was not run.",
        );
        const upsert = await call(client, "bulk_upsert_records", {
            targetOrg: "test-alias",
            sobject: "Account",
            externalIdField: "Ext__c",
            records: records.map((record) => ({ Ext__c: "x", Name: "x" })),
        });
        assert.equal(upsert.success, false);
        assert.equal(
            upsert.message,
            "Confirmation could not be obtained, so the operation was not run.",
        );
        assert.equal(prompts, 2);
    } finally {
        await close();
    }
});

test("with a client prompt, a decline or cancel blocks update and upsert above 500 rows", async () => {
    for (const answer of [
        { action: "decline", expected: "Operation declined by user" },
        { action: "cancel", expected: "Operation cancelled by user" },
    ]) {
        const expected = answer.expected;
        let prompts = 0;
        const onElicit = async () => {
            prompts += 1;
            return { action: answer.action };
        };
        const { client, close } = await connect({ onElicit });
        try {
            const records = Array.from({ length: 501 }, () => ({
                Id: RECORD_ID,
                Name: "x",
            }));
            const update = await call(client, "bulk_update_records", {
                targetOrg: "test-alias",
                sobject: "Account",
                records,
            });
            assert.equal(update.success, false, answer.action);
            assert.equal(update.message, expected);
            const upsert = await call(client, "bulk_upsert_records", {
                targetOrg: "test-alias",
                sobject: "Account",
                externalIdField: "Ext__c",
                records: records.map((record) => ({ Ext__c: "x", Name: "x" })),
            });
            assert.equal(upsert.success, false, answer.action);
            assert.equal(upsert.message, expected);
            assert.equal(prompts, 2);
        } finally {
            await close();
        }
    }
});

test("without a client prompt, update above 500 rows is not refused by the confirmation gate", async () => {
    const { client, close } = await connect();
    try {
        // A nonexistent alias fails at the org lookup, which runs after the
        // gate. Any confirmation refusal would mean the gate blocked it.
        const records = Array.from({ length: 501 }, () => ({
            Id: RECORD_ID,
            Name: "x",
        }));
        const out = await call(client, "bulk_update_records", {
            targetOrg: "no-such-alias-for-tests",
            sobject: "Account",
            records,
        });
        assert.equal(out.success, false);
        assert.doesNotMatch(
            String(out.message),
            /confirm|declined|cannot show/i,
        );
    } finally {
        await close();
    }
});

test("describeJobFailure names a terminal job state and only says 'may still be processing' otherwise", () => {
    for (const state of ["JobComplete", "Failed"]) {
        const text = describeJobFailure({
            message: "Socket reset",
            jobId: "750000000000001AAA",
            state,
        });
        assert.match(text, new RegExp(`finished with state ${state}`));
        assert.match(text, /bulk_job_results or bulk_job_status/);
        assert.doesNotMatch(text, /may still be processing/);
    }
    // bulk_job_results refuses Aborted jobs, so only bulk_job_status is named.
    const aborted = describeJobFailure({
        message: "Socket reset",
        jobId: "750000000000001AAA",
        state: "Aborted",
    });
    assert.match(aborted, /finished with state Aborted/);
    assert.match(aborted, /bulk_job_status with this jobId/);
    assert.doesNotMatch(aborted, /bulk_job_results/);
    assert.doesNotMatch(aborted, /may still be processing/);
    for (const state of [undefined, "Open", "InProgress"]) {
        const text = describeJobFailure({
            message: "Socket reset",
            jobId: "750000000000001AAA",
            state,
        });
        assert.match(text, /may still be processing/, String(state));
        assert.doesNotMatch(text, /finished with state/);
    }
});
