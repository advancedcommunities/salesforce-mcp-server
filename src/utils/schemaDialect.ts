import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

const JSON_SCHEMA_2020_12 = "https://json-schema.org/draft/2020-12/schema";

/**
 * Rewrite a tool schema's declared JSON Schema dialect to 2020-12.
 * @param schema inputSchema/outputSchema object from a tools/list result
 */
function normalizeSchemaDialect(schema: unknown): void {
    if (!schema || typeof schema !== "object") return;
    const jsonSchema = schema as Record<string, unknown>;
    if (
        typeof jsonSchema.$schema === "string" &&
        jsonSchema.$schema !== JSON_SCHEMA_2020_12
    ) {
        jsonSchema.$schema = JSON_SCHEMA_2020_12;
    }
}

/**
 * Normalize the dialect of every tool schema in a tools/list response.
 * @param message outgoing JSON-RPC message
 */
export function normalizeToolSchemaDialects(message: unknown): void {
    const tools = (message as { result?: { tools?: unknown } })?.result?.tools;
    if (!Array.isArray(tools)) return;
    for (const tool of tools) {
        if (!tool || typeof tool !== "object") continue;
        const { inputSchema, outputSchema } = tool as Record<string, unknown>;
        normalizeSchemaDialect(inputSchema);
        normalizeSchemaDialect(outputSchema);
    }
}

/**
 * Wrap a transport so tools/list responses advertise the JSON Schema 2020-12
 * dialect. The MCP SDK converts Zod schemas with a draft-07 target and stamps
 * `"$schema": "http://json-schema.org/draft-07/schema#"` on the result, which
 * clients that validate `outputSchema` with a 2020-12-only Ajv instance reject
 * ("JSON Schema declares an unsupported dialect"). The generated schemas only
 * use keywords that behave identically in both dialects, so relabeling them is
 * safe — keep tool schemas within that subset (notably, avoid `z.tuple()`,
 * which draft-07 renders as an array-form `items`).
 * @param transport transport to wrap in place
 */
export function applySchemaDialectFix(transport: Transport): void {
    const originalSend = transport.send.bind(transport);
    transport.send = async (message, options) => {
        normalizeToolSchemaDialects(message);
        return originalSend(message, options);
    };
}
