/**
 * CSV serialization for Bulk API 2.0 uploads.
 *
 * Rules (chosen to match what Bulk API 2.0 expects):
 * - RFC 4180 quoting: a field is wrapped in double quotes when it contains a
 *   comma, a double quote, or a line break; embedded quotes are doubled.
 * - null is written as the literal "#N/A", which tells Bulk API 2.0 to clear
 *   the field. undefined (a key missing from a record) is written as an empty
 *   cell, which leaves the field unchanged on update and empty on insert.
 * - The header is the union of the keys of all records, in first-seen order.
 * - Nested plain objects are flattened to dotted headers, for example
 *   { Account: { ExtId__c: "x" } } becomes the column "Account.ExtId__c".
 *   The Salesforce "attributes" metadata object is dropped at every depth, so
 *   records taken from SOQL results do not produce "Account.attributes.*" columns.
 * - Booleans and finite numbers are stringified, and Dates are written as ISO
 *   8601. NaN and Infinity are rejected locally.
 * - Rows are terminated with LF, which the Bulk job must declare as lineEnding.
 */

export const BULK_NULL_VALUE = "#N/A";

export type BulkRecord = Record<string, unknown>;

export class BulkCsvError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "BulkCsvError";
    }
}

/** Quotes a single CSV field per RFC 4180 when required. */
export function escapeCsvField(value: string): string {
    if (/[",\r\n]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

/** Converts one scalar value into the text written to a CSV cell. */
export function formatCsvValue(value: unknown): string {
    if (value === undefined) return "";
    if (value === null) return BULK_NULL_VALUE;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            throw new BulkCsvError("Invalid Date value in record");
        }
        return value.toISOString();
    }
    switch (typeof value) {
        case "string":
            return value;
        case "number":
            if (!Number.isFinite(value)) {
                throw new BulkCsvError(
                    `Non-finite number '${String(value)}' in record. Bulk API 2.0 accepts only finite numeric values.`,
                );
            }
            return String(value);
        case "bigint":
        case "boolean":
            return String(value);
        default:
            throw new BulkCsvError(
                `Unsupported value type '${Array.isArray(value) ? "array" : typeof value}' in record. ` +
                    "Bulk API 2.0 accepts only scalar field values.",
            );
    }
}

const isPlainObject = (value: unknown): value is BulkRecord =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date);

/**
 * Flattens one record into a map of dotted column names to scalar values.
 * Insertion order follows the record's key order.
 */
export function flattenBulkRecord(
    record: BulkRecord,
    prefix = "",
    out: Map<string, unknown> = new Map(),
): Map<string, unknown> {
    for (const [key, value] of Object.entries(record)) {
        // SOQL metadata: top-level "attributes" (any value) and nested
        // relationship "attributes" objects ({ type, url }).
        if (key === "attributes" && (prefix === "" || isPlainObject(value))) {
            continue;
        }
        const column = prefix ? `${prefix}.${key}` : key;
        if (isPlainObject(value)) {
            flattenBulkRecord(value, column, out);
        } else {
            out.set(column, value);
        }
    }
    return out;
}

export interface BulkCsvResult {
    csv: string;
    headers: string[];
    rowCount: number;
}

/**
 * Serializes records into a CSV document for a Bulk API 2.0 job.
 * Throws BulkCsvError for values Bulk API 2.0 cannot take (such as arrays).
 */
export function recordsToBulkCsv(records: BulkRecord[]): BulkCsvResult {
    if (records.length === 0) {
        throw new BulkCsvError("At least one record is required");
    }

    const flattened = records.map((record) => flattenBulkRecord(record));

    const headerSet = new Set<string>();
    for (const row of flattened) {
        for (const column of row.keys()) headerSet.add(column);
    }
    const headers = [...headerSet];

    if (headers.length === 0) {
        throw new BulkCsvError("Records must contain at least one field");
    }

    const lines = [headers.map(escapeCsvField).join(",")];
    for (const row of flattened) {
        lines.push(
            headers
                .map((column) =>
                    escapeCsvField(
                        row.has(column) ? formatCsvValue(row.get(column)) : "",
                    ),
                )
                .join(","),
        );
    }

    return {
        csv: `${lines.join("\n")}\n`,
        headers,
        rowCount: records.length,
    };
}

/** Builds a single-column "Id" CSV, used for update, delete and hardDelete. */
export function idsToBulkCsv(ids: string[]): BulkCsvResult {
    return recordsToBulkCsv(ids.map((Id) => ({ Id })));
}
