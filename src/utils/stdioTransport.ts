import type { Readable, Writable } from "node:stream";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

/**
 * Largest JSON-RPC line the stdio transport accepts. The SDK default is 10 MiB,
 * and one tool call carries its whole CSV in a single line. Inline CSV is capped
 * at 10 MiB of UTF-8, and JSON escapes control characters as \u00XX (six bytes
 * each), so a worst-case payload is about 60 MiB plus the envelope. Above the
 * limit the SDK closes the transport and the server stops answering.
 */
export const STDIO_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

export const createStdioTransport = (
    stdin: Readable = process.stdin,
    stdout: Writable = process.stdout,
    maxBufferSize: number = STDIO_MAX_BUFFER_BYTES,
): StdioServerTransport =>
    new StdioServerTransport(stdin, stdout, { maxBufferSize });
