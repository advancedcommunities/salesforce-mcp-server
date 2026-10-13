import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createReadStream, closeSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import type { Connection } from "@salesforce/core";
import z from "zod";
import { permissions } from "../config/permissions.js";
import { getConnection } from "../shared/connection.js";
import { canElicit, requireUserConfirmation } from "../utils/elicitation.js";
import {
    maskOrgReference,
    scrubOrgIdentifiers,
} from "../utils/maskIdentifiers.js";
import { createProgressReporter, type ToolExtra } from "../utils/progress.js";
import {
    resolveTargetOrg,
    toClientOrgLabel,
} from "../utils/resolveTargetOrg.js";
import {
    BulkCsvError,
    idsToBulkCsv,
    recordsToBulkCsv,
    type BulkRecord,
} from "../utils/bulkCsv.js";
import {
    assertWritableTargets,
    inspectCsvText,
    openCsvInput,
    resolveOutputDir,
    writeResultFile,
} from "../utils/bulkFiles.js";

/**
 * Bulk API 2.0 DML tools. Jobs are driven through jsforce's `bulk2` on the
 * existing connection (no CLI shell-out). The job lifecycle is managed here
 * (open, upload, close, bounded poll) instead of using loadAndWaitForResults,
 * which has a poll-timeout name mismatch in jsforce and deletes the job on
 * any error. Jobs are never deleted by these tools.
 */

const MAX_INLINE_ROWS = 2000;
/** Serialized inline CSV cap. 2000 rows of long text can otherwise reach memory limits. */
const MAX_INLINE_BYTES = 10 * 1024 * 1024;
const DEFAULT_WAIT_SECONDS = 30;
const MAX_WAIT_SECONDS = 45;
const POLL_INTERVAL_MS = 2000;
const SAMPLE_SIZE = 10;
/** Update and upsert calls above this many rows ask the user to confirm. */
const CONFIRM_ROW_THRESHOLD = 500;

const TERMINAL_STATES = new Set(["JobComplete", "Failed", "Aborted"]);
const JOB_ID_PATTERN = /^750[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/;
const RECORD_ID_PATTERN = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;
const SOBJECT_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
/** External ID is a field on the object itself, so no relationship dots. */
const EXTERNAL_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

type WriteOperation = "insert" | "update" | "upsert" | "delete" | "hardDelete";
type McpResponse = { content: Array<{ type: "text"; text: string }> };
type IngestJob = ReturnType<Connection["bulk2"]["createJob"]>;
type JobInfo = Awaited<ReturnType<IngestJob["check"]>>;

/**
 * Wraps a Zod object schema with preprocess to handle clients that send
 * stringified JSON instead of a proper object (e.g., Claude Code).
 */
const flexibleInput = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
    z.preprocess((val) => {
        if (typeof val === "string") {
            try {
                return JSON.parse(val);
            } catch {
                return val;
            }
        }
        return val;
    }, schema);

const respond = (payload: Record<string, unknown>): McpResponse => ({
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
});

const succeed = (message: string, data: Record<string, unknown> = {}) =>
    respond({ success: true, message, ...data });

const fail = (message: string, data: Record<string, unknown> = {}) =>
    respond({ success: false, message, ...data });

/** Salesforce's error name for a missing Bulk API Hard Delete permission. */
const HARD_DELETE_NOT_ENABLED = /FEATURENOTENABLED/;

const errorMessage = (error: unknown, operation?: WriteOperation): string => {
    const raw = scrubOrgIdentifiers(
        error instanceof Error ? error.message : String(error),
    );
    if (operation === "hardDelete" && HARD_DELETE_NOT_ENABLED.test(raw)) {
        return `Bulk API hard delete is not enabled for this user. It requires the 'Bulk API Hard Delete' system permission, which is usually granted to System Administrators. Original error: ${raw}`;
    }
    return raw;
};

const delay = (ms: number) =>
    new Promise<void>((resolveDelay) => setTimeout(resolveDelay, ms));

/**
 * Checks the org against ALLOWED_ORGS and, for writes, READ_ONLY. Returns the
 * resolved org or an error response for the client.
 */
const authorize = async (
    targetOrgInput: string | undefined,
    write: boolean,
): Promise<
    | { targetOrg: string; error?: undefined }
    | { targetOrg?: undefined; error: McpResponse }
> => {
    let targetOrg: string;
    try {
        targetOrg = await resolveTargetOrg(targetOrgInput);
    } catch (error) {
        return { error: fail(errorMessage(error)) };
    }

    if (!permissions.isOrgAllowed(targetOrg)) {
        return {
            error: fail(
                `Access to org '${maskOrgReference(targetOrg)}' is not allowed`,
            ),
        };
    }

    if (write && permissions.isReadOnly()) {
        return {
            error: fail(READ_ONLY_MESSAGE),
        };
    }

    return { targetOrg };
};

/* ------------------------------------------------------------------------ */
/* Input preparation                                                         */
/* ------------------------------------------------------------------------ */

type PreparedInput =
    | {
          kind: "text";
          /** "inline" for records or ids, "content" for csvContent. */
          source: "inline" | "content";
          csv: string;
          rowCount: number;
          lineEnding: "LF" | "CRLF";
      }
    | {
          kind: "file";
          /** Open descriptor for the validated file; null once released. */
          fd: number | null;
          path: string;
          fileName: string;
          lineEnding: "LF" | "CRLF";
          bomLength: number;
      };

/** Closes the descriptor of a file input. Safe to call more than once. */
const releaseInput = (prepared: PreparedInput | undefined): void => {
    if (prepared?.kind === "file" && prepared.fd !== null) {
        try {
            closeSync(prepared.fd);
        } catch {
            // Already closed or invalid; nothing else to release.
        }
        prepared.fd = null;
    }
};

/**
 * Rejects an inline Id that is not a 15- or 18-character Salesforce Id, before
 * any org call. Used for update, where Id is the match key.
 */
const assertInlineIds = (records: BulkRecord[]): void => {
    const bad = records.findIndex(
        (record) =>
            typeof record.Id !== "string" || !RECORD_ID_PATTERN.test(record.Id),
    );
    if (bad !== -1) {
        throw new Error(
            `Record ${bad + 1} has an invalid Id '${String(records[bad].Id)}'. Salesforce Ids are 15 or 18 letters and digits.`,
        );
    }
};

/** Guidance naming the sources a tool takes, e.g. "'a', 'b' or 'c'". */
const exactlyOneOf = (names: string[]): string => {
    const quoted = names.map((name) => `'${name}'`);
    const last = quoted.pop();
    return `Provide exactly one of ${quoted.join(", ")} or ${last}`;
};

/** Throws unless exactly one of the sources (in the order of `names`) is given. */
const assertExactlyOneSource = (names: string[], values: unknown[]): void => {
    if (values.filter((value) => value !== undefined).length !== 1) {
        throw new Error(exactlyOneOf(names));
    }
};

/** Loads the validated input. It runs only after authorization passes. */
type InputLoader = () => PreparedInput;

/**
 * Checks the source shape, and inline records or csvContent, without touching
 * the file system. A csvPath is only shape-checked here: the returned loader
 * opens it, so a refused request never reads the file.
 */
const prepareInput = (
    source: { records?: BulkRecord[]; csvPath?: string; csvContent?: string },
    required: string[],
): InputLoader => {
    assertExactlyOneSource(
        ["records", "csvPath", "csvContent"],
        [source.records, source.csvPath, source.csvContent],
    );

    if (source.records !== undefined) {
        const records = source.records;
        if (records.length > MAX_INLINE_ROWS) {
            throw new Error(
                `Too many inline records (${records.length}). The limit is ${MAX_INLINE_ROWS}; use csvContent or csvPath for larger sets.`,
            );
        }
        for (const field of required) {
            const missing = records.findIndex((record) => {
                const value = record[field];
                return value === undefined || value === null || value === "";
            });
            if (missing !== -1) {
                throw new Error(
                    `Record ${missing + 1} is missing required field '${field}'`,
                );
            }
        }
        const { csv, rowCount } = recordsToBulkCsv(records);
        if (Buffer.byteLength(csv, "utf8") > MAX_INLINE_BYTES) {
            throw new Error(
                `Inline records serialize to more than ${MAX_INLINE_BYTES} bytes. Use csvPath for data this large.`,
            );
        }
        const prepared: PreparedInput = {
            kind: "text",
            source: "inline",
            csv,
            rowCount,
            lineEnding: "LF",
        };
        return () => prepared;
    }

    if (source.csvContent !== undefined) {
        const content = inspectCsvText(source.csvContent, {
            required,
            maxBytes: MAX_INLINE_BYTES,
        });
        const prepared: PreparedInput = {
            kind: "text",
            source: "content",
            csv: content.csv,
            rowCount: content.rowCount,
            lineEnding: content.lineEnding,
        };
        return () => prepared;
    }

    const csvPath = source.csvPath!;
    return () => {
        const file = openCsvInput(csvPath, required);
        return {
            kind: "file",
            fd: file.fd,
            path: file.path,
            fileName: file.fileName,
            lineEnding: file.header.lineEnding,
            bomLength: file.header.bomLength,
        };
    };
};

/* ------------------------------------------------------------------------ */
/* Job lifecycle                                                             */
/* ------------------------------------------------------------------------ */

/**
 * Validates the request shape, then checks the org, then loads the input. A
 * malformed request is refused before any org lookup, and a refused org never
 * reads the local file.
 */
const prepareThenAuthorize = async (
    check: () => InputLoader,
    targetOrgInput: string | undefined,
    write: boolean,
): Promise<
    | { prepared: PreparedInput; targetOrg: string; error?: undefined }
    | { prepared?: undefined; targetOrg?: undefined; error: McpResponse }
> => {
    let load: InputLoader;
    try {
        load = check();
    } catch (error) {
        return { error: fail(errorMessage(error)) };
    }
    const auth = await authorize(targetOrgInput, write);
    if (auth.error) return { error: auth.error };
    try {
        return { prepared: load(), targetOrg: auth.targetOrg };
    } catch (error) {
        return { error: fail(errorMessage(error)) };
    }
};

/** Undefined row count means a CSV file, whose size is not known up front. */
const needsConfirmation = (rowCount: number | undefined): boolean =>
    rowCount === undefined || rowCount > CONFIRM_ROW_THRESHOLD;

const countOf = (value: unknown): number =>
    Array.isArray(value) ? value.length : 0;

type FailureSample = { id: string | null; error: string };

const sampleFailures = async (job: IngestJob): Promise<FailureSample[]> => {
    const failed = await job.getFailedResults();
    if (!Array.isArray(failed)) return [];
    return failed.slice(0, SAMPLE_SIZE).map((row) => ({
        id: row.sf__Id || null,
        error: scrubOrgIdentifiers(String(row.sf__Error ?? "")),
    }));
};

/**
 * Records how far a job got, so a failure after job creation can still report
 * the jobId and abort a job that was never closed.
 */
type JobTracker = {
    job?: IngestJob;
    jobId?: string;
    closed: boolean;
    /** Last state read from Salesforce, once polling has read one. */
    state?: string;
};

/**
 * Message for a write that failed after its job was created. A job already in
 * a terminal state is named as such; otherwise it may still be processing.
 */
export const describeJobFailure = (args: {
    message: string;
    jobId: string;
    state?: string;
}): string => {
    if (args.state !== undefined && TERMINAL_STATES.has(args.state)) {
        // bulk_job_results serves only JobComplete and Failed, so an Aborted
        // job points at bulk_job_status alone.
        const next =
            args.state === "Aborted"
                ? "Call bulk_job_status with this jobId for details."
                : "Call bulk_job_results or bulk_job_status with this jobId for details.";
        return `${args.message}. The job ${args.jobId} finished with state ${args.state}. ${next}`;
    }
    return `${args.message}. The job ${args.jobId} was created and may still be processing. Call bulk_job_status with this jobId to check it, or bulk_job_abort to cancel it.`;
};

/**
 * Runs one ingest job end to end: create, upload, close, then poll for at
 * most `waitSeconds`. The job is never deleted. If the wait elapses, the
 * caller gets the jobId and state to check later.
 */
const runIngestJob = async (args: {
    connection: Connection;
    sobject: string;
    operation: WriteOperation;
    externalIdField?: string;
    input: PreparedInput;
    rowCount?: number;
    waitSeconds: number;
    extra: ToolExtra;
    tracker: JobTracker;
}) => {
    const reportProgress = createProgressReporter(args.extra, 4);

    const job = args.connection.bulk2.createJob({
        object: args.sobject,
        operation: args.operation,
        contentType: "CSV",
        columnDelimiter: "COMMA",
        lineEnding: args.input.lineEnding,
        ...(args.externalIdField
            ? { externalIdFieldName: args.externalIdField }
            : {}),
    });
    await job.open();
    const jobId = job.id;
    args.tracker.job = job;
    args.tracker.jobId = jobId;
    reportProgress("Job created");

    let payload: Readable;
    if (args.input.kind === "text") {
        payload = Readable.from([Buffer.from(args.input.csv, "utf8")]);
    } else {
        if (args.input.fd === null) {
            throw new Error("CSV input was already released");
        }
        // Streams from the descriptor validated earlier, not by path. The BOM
        // is skipped, because Bulk API reads it as part of the first column name.
        payload = createReadStream(args.input.path, {
            fd: args.input.fd,
            start: args.input.bomLength,
            autoClose: false,
        });
    }
    await job.uploadData(payload);
    reportProgress("Data uploaded");

    await job.close();
    args.tracker.closed = true;
    reportProgress("Upload closed, processing started");

    const deadline = Date.now() + args.waitSeconds * 1000;
    let info: JobInfo = await job.check();
    while (!TERMINAL_STATES.has(info.state)) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await delay(Math.min(POLL_INTERVAL_MS, remaining));
        info = await job.check();
    }
    args.tracker.state = info.state;
    reportProgress(
        TERMINAL_STATES.has(info.state)
            ? "Processing finished"
            : "Still processing",
    );

    return { job, jobId, info };
};

/** Builds the response for a finished or still-running ingest job. */
const describeIngest = async (args: {
    job: IngestJob;
    info: JobInfo;
    targetOrg: string;
    operation: WriteOperation;
    sobject: string;
    rowCount?: number;
}) => {
    const { job, info } = args;
    const processed = info.numberRecordsProcessed ?? 0;
    const failed = info.numberRecordsFailed ?? 0;
    const finished = TERMINAL_STATES.has(info.state);

    const common = {
        targetOrg: await toClientOrgLabel(args.targetOrg),
        jobId: info.id,
        object: args.sobject,
        operation: args.operation,
        state: info.state,
        processed,
        failed,
    };

    if (!finished) {
        return succeed(
            `Job is still processing after the wait period. Call bulk_job_status with jobId '${info.id}' to check progress, or bulk_job_abort to cancel it.`,
            { ...common, timedOut: true },
        );
    }

    let unprocessed: number | undefined;
    if (info.state === "Failed") {
        // Bulk can refuse to list unprocessed rows of a failed job (for example
        // when line endings are invalid). The job's own errorMessage is the
        // useful part, so a failed listing is not allowed to hide it.
        try {
            unprocessed = countOf(await job.getUnprocessedRecords());
        } catch {
            unprocessed = undefined;
        }
    } else if (args.rowCount !== undefined) {
        unprocessed = Math.max(0, args.rowCount - processed);
    }

    const samples = failed > 0 ? await sampleFailures(job) : [];
    const data = {
        ...common,
        ...(unprocessed !== undefined ? { unprocessed } : {}),
        ...(samples.length > 0 ? { sampleFailures: samples } : {}),
        ...(failed > 0
            ? {
                  resultsHint:
                      "Call bulk_job_results with this jobId to write the full success, failed and unprocessed CSV files.",
              }
            : {}),
    };

    if (info.state === "Aborted") {
        return fail("Job was aborted before it finished", data);
    }
    if (info.state === "Failed") {
        return fail(
            `Bulk job failed: ${scrubOrgIdentifiers(info.errorMessage ?? "unknown error")}`,
            data,
        );
    }
    return succeed(
        failed > 0
            ? `Job completed: ${processed} processed, ${failed} failed`
            : `Job completed: ${processed} processed, no failures`,
        data,
    );
};

/**
 * Shared implementation for insert, update, upsert, delete and hardDelete.
 * Validation and confirmation happen in the tool handlers before this runs.
 */
const executeWrite = async (args: {
    targetOrg: string;
    sobject: string;
    operation: WriteOperation;
    externalIdField?: string;
    input: PreparedInput;
    rowCount?: number;
    waitSeconds: number;
    extra: ToolExtra;
}): Promise<McpResponse> => {
    const tracker: JobTracker = { closed: false };
    try {
        const connection = await getConnection(args.targetOrg);
        const { job, info } = await runIngestJob({
            connection,
            sobject: args.sobject,
            operation: args.operation,
            externalIdField: args.externalIdField,
            input: args.input,
            rowCount: args.rowCount,
            waitSeconds: args.waitSeconds,
            extra: args.extra,
            tracker,
        });
        return await describeIngest({
            job,
            info,
            targetOrg: args.targetOrg,
            operation: args.operation,
            sobject: args.sobject,
            rowCount: args.rowCount,
        });
    } catch (error) {
        const message = errorMessage(error, args.operation);
        if (tracker.jobId === undefined || tracker.job === undefined) {
            return fail(message);
        }
        const jobId = tracker.jobId;
        const data = {
            jobId,
            object: args.sobject,
            operation: args.operation,
        };
        if (!tracker.closed) {
            // The upload never completed, so Salesforce would wait for more
            // data. Abort it now rather than leave it Open.
            try {
                await tracker.job.abort();
                return fail(
                    `${message}. The ingest job ${jobId} was aborted because its upload did not complete.`,
                    { ...data, aborted: true },
                );
            } catch {
                return fail(
                    `${message}. The ingest job ${jobId} is still open and could not be aborted automatically. Call bulk_job_abort with this jobId.`,
                    { ...data, aborted: false },
                );
            }
        }
        return fail(
            describeJobFailure({ message, jobId, state: tracker.state }),
            data,
        );
    } finally {
        releaseInput(args.input);
    }
};

type ConfirmPolicy = {
    /** Whether the user must confirm this call. */
    required: boolean;
    message: (orgLabel: string) => string;
};

/** Row count of loaded text input; undefined for a CSV file, whose size is not known up front. */
const rowCountOf = (prepared: PreparedInput): number | undefined =>
    prepared.kind === "text" ? prepared.rowCount : undefined;

/**
 * Runs a write after confirmation. The prompt is shown only when the client
 * supports elicitation, and then it fails closed: a decline, cancel or failed
 * prompt releases the input and refuses the job. Without elicitation, the
 * caller's own gate (such as a typed confirm literal) is the only check.
 */
const confirmThenExecute = async (args: {
    targetOrg: string;
    sobject: string;
    operation: WriteOperation;
    externalIdField?: string;
    prepared: PreparedInput;
    waitSeconds: number;
    extra: ToolExtra;
    confirm?: {
        /** Whether the user must confirm this call. */
        required: boolean;
        message: (orgLabel: string) => string;
    };
}): Promise<McpResponse> => {
    if (args.confirm?.required && canElicit()) {
        try {
            const label = await toClientOrgLabel(args.targetOrg);
            const { confirmed, message } = await requireUserConfirmation(
                args.confirm.message(label),
            );
            if (!confirmed) {
                releaseInput(args.prepared);
                return fail(message ?? "Operation cancelled");
            }
        } catch (error) {
            releaseInput(args.prepared);
            return fail(errorMessage(error, args.operation));
        }
    }
    return executeWrite({
        targetOrg: args.targetOrg,
        sobject: args.sobject,
        operation: args.operation,
        externalIdField: args.externalIdField,
        input: args.prepared,
        rowCount:
            args.prepared.kind === "text" ? args.prepared.rowCount : undefined,
        waitSeconds: args.waitSeconds,
        extra: args.extra,
    });
};

/**
 * The single path every write tool takes after its own shape checks: the org
 * is authorized first, then the input is loaded, then the confirmation gate
 * runs. `confirm` is computed from the loaded input so a prompt can name the
 * row count or the file. Keeps the gates consistent across the write tools.
 */
const gatedWrite = async (args: {
    check: () => InputLoader;
    targetOrg?: string;
    sobject: string;
    operation: WriteOperation;
    externalIdField?: string;
    wait?: number;
    extra: ToolExtra;
    confirm?: (prepared: PreparedInput) => ConfirmPolicy;
}): Promise<McpResponse> => {
    const ready = await prepareThenAuthorize(args.check, args.targetOrg, true);
    if (ready.error) return ready.error;
    return confirmThenExecute({
        targetOrg: ready.targetOrg,
        sobject: args.sobject,
        operation: args.operation,
        externalIdField: args.externalIdField,
        prepared: ready.prepared,
        waitSeconds: args.wait ?? DEFAULT_WAIT_SECONDS,
        extra: args.extra,
        confirm: args.confirm?.(ready.prepared),
    });
};

const waitSchema = z
    .number()
    .int()
    .min(0)
    .max(MAX_WAIT_SECONDS)
    .optional()
    .describe(
        `Seconds to wait for the job to finish before returning (0 to ${MAX_WAIT_SECONDS}, default ${DEFAULT_WAIT_SECONDS}). If the job is still running, the response includes its jobId and state, and bulk_job_status can be used later.`,
    );

const targetOrgSchema = z
    .string()
    .optional()
    .describe(
        "Username or alias of the target org. If not provided, uses the default org from SF CLI configuration.",
    );

const sobjectSchema = z
    .string()
    .regex(SOBJECT_PATTERN, "Invalid SObject API name")
    .describe(
        "API name of the Salesforce object (e.g., 'Account', 'Contact', 'CustomObject__c'). Execute the sobject_list tool first to get the correct API name.",
    );

const recordsSchema = z
    .array(z.record(z.string(), z.unknown()))
    .max(MAX_INLINE_ROWS)
    .optional()
    .describe(
        `Inline records as JSON objects (max ${MAX_INLINE_ROWS}). Keys are field API names; use dotted keys or nested objects for relationships (e.g. {"Account": {"ExtId__c": "x"}}). Null values clear a field. Provide exactly one of records, csvPath or csvContent.`,
    );

const csvPathSchema = z
    .string()
    .optional()
    .describe(
        "Absolute path to a .csv file on the MCP server's machine (UTF-8, comma-delimited, header row required, max 150 MB). Symlinks are followed, and the target must be a regular file. No folder restriction applies: any .csv the server process can read can be uploaded, so pass only paths you intend to send to the connected org. Use this for files already on disk. If the file was uploaded into a sandboxed client, use csvContent instead. Ids in the file are not format-checked before upload; a malformed Id fails only its own row. Provide exactly one of records, csvPath or csvContent.",
    );

const csvContentSchema = z
    .string()
    .optional()
    .describe(
        `Raw CSV text, including the header row (UTF-8, comma-delimited, max ${MAX_INLINE_BYTES / (1024 * 1024)} MB; a leading byte order mark is allowed). Use this when the CSV is not readable from the server's machine, for example when the file was uploaded into a sandboxed client such as Claude Cowork, whose file paths the server cannot see. Pass the file's exact text. Ids in the text are not format-checked before upload; a malformed Id fails only its own row. Provide exactly one of records, csvPath or csvContent.`,
    );

const jobIdSchema = z
    .string()
    .regex(JOB_ID_PATTERN, "Invalid Bulk API job Id")
    .describe(
        "Bulk API 2.0 job Id (starts with 750), as returned by a bulk_* tool.",
    );

const writeAnnotations = (destructive: boolean, idempotent: boolean) => ({
    readOnlyHint: false,
    destructiveHint: destructive,
    idempotentHint: idempotent,
    openWorldHint: true,
});

const readAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
};

/** Shared input path for delete-style tools (ids, csvPath or csvContent). */
const prepareDeleteInput = (source: {
    ids?: string[];
    csvPath?: string;
    csvContent?: string;
}): InputLoader => {
    assertExactlyOneSource(
        ["ids", "csvPath", "csvContent"],
        [source.ids, source.csvPath, source.csvContent],
    );
    if (source.ids !== undefined) {
        const ids = source.ids;
        const invalid = ids.find((id) => !RECORD_ID_PATTERN.test(id));
        if (invalid !== undefined) {
            throw new Error(`Invalid Salesforce record Id '${invalid}'`);
        }
        if (ids.length === 0) {
            throw new Error("ids must contain at least one Id");
        }
        const { csv, rowCount } = idsToBulkCsv(ids);
        const prepared: PreparedInput = {
            kind: "text",
            source: "inline",
            csv,
            rowCount,
            lineEnding: "LF",
        };
        return () => prepared;
    }
    return prepareInput(
        { csvPath: source.csvPath, csvContent: source.csvContent },
        ["Id"],
    );
};

/** Names the rows a delete or hardDelete acts on, for the confirmation text. */
const deleteSubject = (
    prepared: PreparedInput,
    sobject: string,
    csvPath?: string,
): string => {
    if (prepared.kind === "text") {
        const count = `${prepared.rowCount} ${sobject} record(s)`;
        return prepared.source === "content"
            ? `${count} from the provided CSV content`
            : count;
    }
    return `the ${sobject} records in '${basename(csvPath ?? prepared.fileName)}'`;
};

/**
 * Refusal for a delete whose typed confirm literal is missing or wrong, or
 * undefined when it matches. Shared by both delete tools. Callers run it
 * before any org call.
 */
const typedConfirmRefusal = (
    confirm: string | undefined,
    expected: string,
    headline: string,
): string | undefined =>
    confirm === expected
        ? undefined
        : `${headline} Pass confirm: "${expected}" to continue.`;

const READ_ONLY_MESSAGE =
    "Cannot run Bulk API write operations: Server is in read-only mode";

export const registerBulkTools = (server: McpServer) => {
    server.registerTool(
        "bulk_insert_records",
        {
            description:
                "Insert many records with the Bulk API 2.0 (asynchronous, for large volumes). Provide exactly one of 'records' (inline JSON objects, max 2000), 'csvPath' (a CSV file on the server's machine) or 'csvContent' (raw CSV text with its header row, for files the server cannot read, such as uploads into a sandboxed client; max 10 MB). Returns the jobId, state, processed and failed counts, and up to 10 sample failures when the job finishes within 'wait' seconds. Use bulk_job_results for full result files. Do not include Id values for inserts. Null values are written as #N/A, which clears a field.",
            inputSchema: {
                input: flexibleInput(
                    z.object({
                        targetOrg: targetOrgSchema,
                        sobject: sobjectSchema,
                        records: recordsSchema,
                        csvPath: csvPathSchema,
                        csvContent: csvContentSchema,
                        wait: waitSchema,
                    }),
                ),
            },
            annotations: writeAnnotations(false, false),
        },
        async ({ input }, extra: ToolExtra) => {
            return gatedWrite({
                check: () => prepareInput(input, []),
                targetOrg: input.targetOrg,
                sobject: input.sobject,
                operation: "insert",
                wait: input.wait,
                extra,
            });
        },
    );

    server.registerTool(
        "bulk_update_records",
        {
            description:
                "Update many existing records by Id with the Bulk API 2.0. Each record (or each CSV row) must include 'Id'; only the provided fields are changed. Provide exactly one of 'records', 'csvPath' or 'csvContent'. Inline Ids are format-checked before the job is created; Ids in CSV text are not, and a malformed one fails only its own row. Null values are written as #N/A, which clears a field. Updates above 500 rows ask the user to confirm when the client supports confirmation. Returns the jobId, state, processed and failed counts, and sample failures when the job finishes within 'wait' seconds.",
            inputSchema: {
                input: flexibleInput(
                    z.object({
                        targetOrg: targetOrgSchema,
                        sobject: sobjectSchema,
                        records: recordsSchema,
                        csvPath: csvPathSchema,
                        csvContent: csvContentSchema,
                        wait: waitSchema,
                    }),
                ),
            },
            annotations: writeAnnotations(true, true),
        },
        async ({ input }, extra: ToolExtra) => {
            return gatedWrite({
                check: () => {
                    const load = prepareInput(input, ["Id"]);
                    if (input.records !== undefined) {
                        assertInlineIds(input.records);
                    }
                    return load;
                },
                targetOrg: input.targetOrg,
                sobject: input.sobject,
                operation: "update",
                wait: input.wait,
                extra,
                confirm: (prepared) => {
                    const rowCount = rowCountOf(prepared);
                    return {
                        required: needsConfirmation(rowCount),
                        message: (label) =>
                            `Update ${rowCount ?? "the rows in the CSV file"} ${input.sobject} record(s) in org '${label}'?`,
                    };
                },
            });
        },
    );

    server.registerTool(
        "bulk_upsert_records",
        {
            description:
                "Insert or update many records with the Bulk API 2.0, matching existing records on an external ID field. Each record (or CSV row) must include the externalIdField value; do not include Id. Provide exactly one of 'records', 'csvPath' or 'csvContent'. Upserts above 500 rows ask the user to confirm when the client supports confirmation. Returns the jobId, state, processed and failed counts, and sample failures when the job finishes within 'wait' seconds.",
            inputSchema: {
                input: flexibleInput(
                    z.object({
                        targetOrg: targetOrgSchema,
                        sobject: sobjectSchema,
                        externalIdField: z
                            .string()
                            .regex(
                                EXTERNAL_ID_PATTERN,
                                "Invalid external ID field API name",
                            )
                            .describe(
                                "API name of the external ID field used to match records (e.g., 'ExternalId__c'). Must be a field on the object itself, not a relationship path.",
                            ),
                        records: recordsSchema,
                        csvPath: csvPathSchema,
                        csvContent: csvContentSchema,
                        wait: waitSchema,
                    }),
                ),
            },
            annotations: writeAnnotations(true, true),
        },
        async ({ input }, extra: ToolExtra) => {
            return gatedWrite({
                check: () => prepareInput(input, [input.externalIdField]),
                targetOrg: input.targetOrg,
                sobject: input.sobject,
                operation: "upsert",
                externalIdField: input.externalIdField,
                wait: input.wait,
                extra,
                confirm: (prepared) => {
                    const rowCount = rowCountOf(prepared);
                    return {
                        required: needsConfirmation(rowCount),
                        message: (label) =>
                            `Upsert ${rowCount ?? "the rows in the CSV file"} ${input.sobject} record(s) on ${input.externalIdField} in org '${label}'?`,
                    };
                },
            });
        },
    );

    server.registerTool(
        "bulk_delete_records",
        {
            description:
                "Soft-delete many records with the Bulk API 2.0 (moves them to the Recycle Bin). Provide exactly one of 'ids' (max 2000 Salesforce record Ids), 'csvPath' (a CSV file on the server's machine with an 'Id' column) or 'csvContent' (raw CSV text with an 'Id' column, for files the server cannot read). If the client can show a confirmation prompt, the user is asked and declining blocks the delete. If it cannot, pass confirm: 'DELETE <sobject>' (for example 'DELETE Account') and the user's approval of this call in the client is the remaining gate. Returns the jobId, state, processed and failed counts. Use bulk_hard_delete_records to permanently delete.",
            inputSchema: {
                input: flexibleInput(
                    z.object({
                        targetOrg: targetOrgSchema,
                        sobject: sobjectSchema,
                        ids: z
                            .array(z.string())
                            .max(MAX_INLINE_ROWS)
                            .optional()
                            .describe(
                                `Record Ids to delete (max ${MAX_INLINE_ROWS}). Provide exactly one of ids, csvPath or csvContent.`,
                            ),
                        csvPath: csvPathSchema,
                        csvContent: csvContentSchema,
                        confirm: z
                            .string()
                            .optional()
                            .describe(
                                "Required only when the client cannot show a confirmation prompt, and then must be exactly 'DELETE <sobject>' (for example 'DELETE Account'). Ignored when the client can prompt the user.",
                            ),
                        wait: waitSchema,
                    }),
                ),
            },
            annotations: writeAnnotations(true, true),
        },
        async ({ input }, extra: ToolExtra) => {
            // Read-only mode wins over the confirm refusal below, so the
            // message names the real reason.
            if (permissions.isReadOnly()) return fail(READ_ONLY_MESSAGE);
            const prompted = canElicit();
            if (!prompted) {
                // No client prompt, so the typed literal is the guard. It is
                // checked before any org call.
                const refusal = typedConfirmRefusal(
                    input.confirm,
                    `DELETE ${input.sobject}`,
                    "Delete not confirmed. This client cannot show a confirmation prompt, so the user must approve this call in the client. Records go to the Recycle Bin.",
                );
                if (refusal) return fail(refusal);
            }

            return gatedWrite({
                check: () => prepareDeleteInput(input),
                targetOrg: input.targetOrg,
                sobject: input.sobject,
                operation: "delete",
                wait: input.wait,
                extra,
                confirm: (prepared) => {
                    const subject = deleteSubject(
                        prepared,
                        input.sobject,
                        input.csvPath,
                    );
                    return {
                        required: true,
                        message: (label) =>
                            `Delete ${subject} in org '${label}'? Records go to the Recycle Bin.`,
                    };
                },
            });
        },
    );

    server.registerTool(
        "bulk_hard_delete_records",
        {
            description:
                "PERMANENTLY delete many records with the Bulk API 2.0 hardDelete operation. Records bypass the Recycle Bin and cannot be restored. Requires the 'Bulk API Hard Delete' permission on the user. Provide exactly one of 'ids', 'csvPath' or 'csvContent' (CSV with an 'Id' column), and the exact 'confirm' string 'HARD DELETE <sobject>' (for example 'HARD DELETE Account'). If the client can show a confirmation prompt, the user is also asked and declining blocks the delete. Otherwise the typed 'confirm' string and the user's approval of this call in the client are the gates.",
            inputSchema: {
                input: flexibleInput(
                    z.object({
                        targetOrg: targetOrgSchema,
                        sobject: sobjectSchema,
                        ids: z
                            .array(z.string())
                            .max(MAX_INLINE_ROWS)
                            .optional()
                            .describe(
                                `Record Ids to permanently delete (max ${MAX_INLINE_ROWS}). Provide exactly one of ids, csvPath or csvContent.`,
                            ),
                        csvPath: csvPathSchema,
                        csvContent: csvContentSchema,
                        confirm: z
                            .string()
                            .optional()
                            .describe(
                                "Required. Must be exactly 'HARD DELETE <sobject>' with the same SObject as the sobject field, for example 'HARD DELETE Account'. Omitting it is refused with the same message as a wrong value.",
                            ),
                        wait: waitSchema,
                    }),
                ),
            },
            annotations: writeAnnotations(true, true),
        },
        async ({ input }, extra: ToolExtra) => {
            if (permissions.isReadOnly()) return fail(READ_ONLY_MESSAGE);
            // Checked before any org call and in every client: the typed
            // literal is always required, with or without a client prompt.
            const refusal = typedConfirmRefusal(
                input.confirm,
                `HARD DELETE ${input.sobject}`,
                "Hard delete not confirmed. Records deleted this way cannot be restored.",
            );
            if (refusal) return fail(refusal);

            return gatedWrite({
                check: () => prepareDeleteInput(input),
                targetOrg: input.targetOrg,
                sobject: input.sobject,
                operation: "hardDelete",
                wait: input.wait,
                extra,
                confirm: (prepared) => {
                    const subject = deleteSubject(
                        prepared,
                        input.sobject,
                        input.csvPath,
                    );
                    return {
                        required: true,
                        message: (label) =>
                            `PERMANENTLY hard delete ${subject} in org '${label}'? This bypasses the Recycle Bin and cannot be undone.`,
                    };
                },
            });
        },
    );

    server.registerTool(
        "bulk_job_status",
        {
            description:
                "Check the state and record counts of a Bulk API 2.0 job created by a bulk_* tool. Use it after a start call returned a non-final state. Read-only.",
            inputSchema: {
                input: flexibleInput(
                    z.object({
                        targetOrg: targetOrgSchema,
                        jobId: jobIdSchema,
                    }),
                ),
            },
            annotations: readAnnotations,
        },
        async ({ input }) => {
            const auth = await authorize(input.targetOrg, false);
            if (auth.error) return auth.error;
            try {
                const connection = await getConnection(auth.targetOrg);
                const job = connection.bulk2.job("ingest", { id: input.jobId });
                const info = await job.check();
                const finished = TERMINAL_STATES.has(info.state);
                return succeed(
                    finished
                        ? `Job is ${info.state}`
                        : `Job is ${info.state}; check again later`,
                    {
                        targetOrg: await toClientOrgLabel(auth.targetOrg),
                        jobId: info.id,
                        object: info.object,
                        operation: info.operation,
                        state: info.state,
                        processed: info.numberRecordsProcessed ?? 0,
                        failed: info.numberRecordsFailed ?? 0,
                        finished,
                        ...(info.errorMessage
                            ? {
                                  errorMessage: scrubOrgIdentifiers(
                                      info.errorMessage,
                                  ),
                              }
                            : {}),
                    },
                );
            } catch (error) {
                return fail(errorMessage(error));
            }
        },
    );

    server.registerTool(
        "bulk_job_results",
        {
            description:
                "Write the successful, failed and unprocessed records of a finished Bulk API 2.0 job to CSV files and return their paths and row counts. Files go to <home>/salesforce-bulk-results/<jobId>/ unless outputDir is given. The result folder itself must not be a symbolic link (default or custom); symbolic links in parent folders are not checked. A custom outputDir must be an absolute path and must not already contain these files. Read-only in the org; writes local CSV files.",
            inputSchema: {
                input: flexibleInput(
                    z.object({
                        targetOrg: targetOrgSchema,
                        jobId: jobIdSchema,
                        outputDir: z
                            .string()
                            .optional()
                            .describe(
                                "Absolute directory to write the CSV files into. Created if missing. Must not be a symbolic link, and must not already contain these files.",
                            ),
                    }),
                ),
            },
            // Writes local files, so this is not read-only even though it
            // never changes anything in the org.
            annotations: writeAnnotations(false, true),
        },
        async ({ input }) => {
            const auth = await authorize(input.targetOrg, false);
            if (auth.error) return auth.error;
            try {
                const connection = await getConnection(auth.targetOrg);
                const job = connection.bulk2.job("ingest", { id: input.jobId });
                const info = await job.check();
                if (!["JobComplete", "Failed"].includes(info.state)) {
                    return fail(
                        `Job is ${info.state}. Results are available once the job is JobComplete or Failed.`,
                        { jobId: input.jobId, state: info.state },
                    );
                }

                const { dir, custom } = resolveOutputDir(
                    join(homedir(), "salesforce-bulk-results", input.jobId),
                    input.outputDir,
                );
                const [successful, failed, unprocessed] = await Promise.all([
                    job.getSuccessfulResults(),
                    job.getFailedResults(),
                    job.getUnprocessedRecords(),
                ]);

                const sets = {
                    successful: ["successful-results.csv", successful],
                    failed: ["failed-results.csv", failed],
                    unprocessed: ["unprocessed-records.csv", unprocessed],
                } as const;
                // Build every file first, then check every target, so a
                // refusal never leaves a partial set of files behind.
                const prepared = Object.entries(sets).map(
                    ([key, [fileName, rows]]) => {
                        const list: BulkRecord[] = Array.isArray(rows)
                            ? (rows as BulkRecord[])
                            : [];
                        return {
                            key,
                            path: join(dir, fileName),
                            rows: list.length,
                            csv:
                                list.length > 0
                                    ? recordsToBulkCsv(list).csv
                                    : "",
                        };
                    },
                );
                assertWritableTargets(
                    prepared.map((item) => item.path),
                    custom,
                );
                const files: Record<string, { path: string; rows: number }> =
                    {};
                for (const item of prepared) {
                    writeResultFile(item.path, item.csv, custom);
                    files[item.key] = { path: item.path, rows: item.rows };
                }

                return succeed(`Wrote job results to ${dir}`, {
                    targetOrg: await toClientOrgLabel(auth.targetOrg),
                    jobId: input.jobId,
                    state: info.state,
                    outputDir: dir,
                    files,
                });
            } catch (error) {
                if (error instanceof BulkCsvError) {
                    return fail(error.message);
                }
                return fail(errorMessage(error));
            }
        },
    );

    server.registerTool(
        "bulk_job_abort",
        {
            description:
                "Abort a Bulk API 2.0 job that has not finished (Open, UploadComplete or InProgress). Records already processed are not rolled back. Jobs are never deleted by these tools.",
            inputSchema: {
                input: flexibleInput(
                    z.object({
                        targetOrg: targetOrgSchema,
                        jobId: jobIdSchema,
                    }),
                ),
            },
            annotations: writeAnnotations(true, true),
        },
        async ({ input }) => {
            const auth = await authorize(input.targetOrg, true);
            if (auth.error) return auth.error;
            try {
                const connection = await getConnection(auth.targetOrg);
                const job = connection.bulk2.job("ingest", { id: input.jobId });
                await job.abort();
                const info = job.getInfo();
                return succeed(`Job ${input.jobId} aborted`, {
                    targetOrg: await toClientOrgLabel(auth.targetOrg),
                    jobId: input.jobId,
                    state: info.state,
                });
            } catch (error) {
                return fail(errorMessage(error));
            }
        },
    );
};
