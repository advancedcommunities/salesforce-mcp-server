/**
 * Local file policy for the Bulk API tools: which CSV files may be uploaded,
 * where result files may be written, and how a CSV header is read.
 */
import {
    closeSync,
    constants as fsConstants,
    fstatSync,
    lstatSync,
    mkdirSync,
    openSync,
    readSync,
    realpathSync,
    statSync,
    writeSync,
} from "node:fs";
import { extname, isAbsolute, resolve, sep } from "node:path";

export const MAX_CSV_BYTES = 150 * 1024 * 1024;
export const HEADER_READ_BYTES = 64 * 1024;
const SCAN_CHUNK_BYTES = 256 * 1024;
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * Parses one CSV header line into column names (RFC 4180 quoting). Names are
 * returned as written, spaces included, because Bulk API reads them literally;
 * assertCleanHeaders rejects padded names.
 */
export const parseHeaderLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (quoted) {
            if (char === '"' && line[i + 1] === '"') {
                current += '"';
                i++;
            } else if (char === '"') {
                quoted = false;
            } else {
                current += char;
            }
        } else if (char === '"' && current === "") {
            // A quote opens a cell only at its start, matching CsvScanner.
            quoted = true;
        } else if (char === ",") {
            cells.push(current);
            current = "";
        } else {
            current += char;
        }
    }
    cells.push(current);
    return cells;
};

/**
 * Rejects header names with leading or trailing whitespace. The upload sends
 * the header text unchanged, so a name such as "Id " would reach Bulk API as
 * written and fail the job after it was created.
 */
export const assertCleanHeaders = (
    headers: string[],
    source: "CSV file" | "CSV content",
): void => {
    const padded = headers.find((header) => header !== header.trim());
    if (padded !== undefined) {
        throw new Error(
            `${source} has a header name with leading or trailing spaces: '${padded}'. Remove the spaces; Bulk API reads header names exactly as written.`,
        );
    }
};

export interface CsvHeaderInfo {
    headers: string[];
    /** Terminator of the header line itself. Later rows are not considered. */
    lineEnding: "LF" | "CRLF";
    /** Bytes of UTF-8 BOM at the start of the file (0 or 3). */
    bomLength: number;
    /** Byte offset in the file where the first data row starts. */
    bodyStart: number;
}

export interface CsvTextHeader {
    headers: string[];
    lineEnding: "LF" | "CRLF";
    /** Offset in the text where the first data row starts. */
    bodyStart: number;
}

/**
 * Reads the header row and its terminator from CSV text that has no BOM.
 * Shared by file uploads (csvPath) and inline text (csvContent).
 */
export const readCsvHeaderText = (text: string): CsvTextHeader => {
    const firstBreak = text.search(/\r?\n/);
    const headerLine = firstBreak === -1 ? text : text.slice(0, firstBreak);
    // Only the first break decides the terminator. A CRLF inside a quoted
    // cell further down must not change the declared line ending.
    const crlf =
        firstBreak !== -1 && text.slice(firstBreak, firstBreak + 2) === "\r\n";
    return {
        headers: parseHeaderLine(headerLine),
        lineEnding: crlf ? "CRLF" : "LF",
        bodyStart:
            firstBreak === -1 ? text.length : firstBreak + (crlf ? 2 : 1),
    };
};

/** Removes a leading UTF-8 BOM (U+FEFF) from decoded text. */
export const stripUtf8Bom = (text: string): string =>
    text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

export interface CsvScan {
    /** Records with data. Blank and whitespace-only lines are not rows. */
    rows: number;
    /** Any byte other than a space, tab, CR or LF, anywhere after the header. */
    text: boolean;
    /** Unquoted line breaks that end in CRLF. */
    crlf: number;
    /** Unquoted line breaks that end in a bare LF. */
    lf: number;
}

const QUOTE = 0x22;
const SPACE = 0x20;
const TAB = 0x09;
const COMMA = 0x2c;
const LF = 0x0a;
const CR = 0x0d;

/**
 * Byte-level, quote-aware CSV scanner (RFC 4180). A quote opens a quoted cell
 * only at the start of a cell, and "" inside quotes is an escaped quote, so a
 * stray quote in an unquoted cell is ordinary text. Line breaks inside quotes
 * do not end a record. Bytes are fed in chunks, so files can be scanned
 * without loading them whole.
 */
export class CsvScanner {
    private quoted = false;
    /** Inside quotes, the previous byte was a quote that may close the cell. */
    private pendingQuote = false;
    private fieldStart = true;
    private lastCR = false;
    private recordHasData = false;
    private readonly result: CsvScan = { rows: 0, text: false, crlf: 0, lf: 0 };

    feed(bytes: Uint8Array): void {
        for (let i = 0; i < bytes.length; i++) {
            this.push(bytes[i]);
        }
    }

    /** Closes the last record (a final row may lack a line break). */
    end(): CsvScan {
        if (this.recordHasData) this.result.rows++;
        this.recordHasData = false;
        return { ...this.result };
    }

    private push(byte: number): void {
        if (byte !== SPACE && byte !== TAB && byte !== CR && byte !== LF) {
            this.result.text = true;
        }
        if (this.quoted) {
            if (!this.pendingQuote) {
                if (byte === QUOTE) this.pendingQuote = true;
                return;
            }
            this.pendingQuote = false;
            if (byte === QUOTE) return; // escaped quote, still inside the cell
            this.quoted = false; // the previous quote closed the cell
        }

        if (byte === CR) {
            this.lastCR = true;
            return;
        }
        if (byte === LF) {
            if (this.recordHasData) this.result.rows++;
            if (this.lastCR) this.result.crlf++;
            else this.result.lf++;
            this.lastCR = false;
            this.recordHasData = false;
            this.fieldStart = true;
            return;
        }
        this.lastCR = false;
        // Spaces and tabs alone do not make a record: a line of only
        // whitespace is blank, as an empty line is.
        if (byte !== SPACE && byte !== TAB) this.recordHasData = true;
        if (byte === COMMA) {
            this.fieldStart = true;
            return;
        }
        if (byte === QUOTE && this.fieldStart) {
            this.quoted = true;
        }
        this.fieldStart = false;
    }
}

/** Scans CSV text from `start`, for the data rows after the header. */
export const scanCsvText = (text: string, start: number): CsvScan => {
    const scanner = new CsvScanner();
    scanner.feed(Buffer.from(text.slice(start), "utf8"));
    return scanner.end();
};

/**
 * Throws when any line break in the body ends in the other line ending from
 * the header. Bulk API rejects that only after the job is created, with an
 * error the caller cannot easily match to the file, so it is checked first.
 */
export const assertUniformLineEndings = (
    scan: CsvScan,
    lineEnding: "LF" | "CRLF",
    source: "CSV file" | "CSV content",
): void => {
    const other = lineEnding === "CRLF" ? scan.lf : scan.crlf;
    if (other > 0) {
        const otherName = lineEnding === "CRLF" ? "LF" : "CRLF";
        throw new Error(
            `${source} mixes line endings: its header row ends in ${lineEnding}, but ${other} line break(s) end in ${otherName}. Use one line ending throughout.`,
        );
    }
};

/**
 * Throws when the input has a header but no data rows. Shared by csvPath and
 * csvContent, so both refuse the same files with the same message.
 */
export const assertDataRows = (scan: CsvScan): void => {
    if (scan.rows === 0) {
        throw new Error(
            "The CSV has a header row but no data rows. Provide at least one row.",
        );
    }
};

/** Scans an open file from `start`, in fixed-size chunks. */
const scanCsvFd = (fd: number, size: number, start: number): CsvScan => {
    const scanner = new CsvScanner();
    const buffer = Buffer.alloc(SCAN_CHUNK_BYTES);
    let position = start;
    while (position < size) {
        const bytes = readSync(fd, buffer, 0, buffer.length, position);
        if (bytes === 0) break;
        scanner.feed(buffer.subarray(0, bytes));
        position += bytes;
    }
    return scanner.end();
};

/** Throws when a required column is missing from the header row. */
export const assertRequiredColumns = (
    headers: string[],
    required: string[],
    source: "CSV file" | "CSV content",
): void => {
    for (const field of required) {
        if (!headers.includes(field)) {
            throw new Error(
                `${source} must have a '${field}' column in its header row`,
            );
        }
    }
};

export interface InspectedCsvText {
    /** Text to upload: BOM removed, line endings as the header declares. */
    csv: string;
    lineEnding: "LF" | "CRLF";
    rowCount: number;
}

/**
 * Validates CSV text supplied directly by the client (csvContent). Applies the
 * same rules as openCsvInput: BOM stripped, header required, line ending from
 * the header terminator, required columns present. Also rejects empty and
 * header-only text, and text over maxBytes (measured in UTF-8 bytes).
 */
export const inspectCsvText = (
    raw: string,
    options: { required: string[]; maxBytes: number },
): InspectedCsvText => {
    const bytes = Buffer.byteLength(raw, "utf8");
    // trim() also strips U+FEFF, so a BOM-only input counts as empty.
    if (raw.trim() === "") {
        throw new Error(
            "csvContent is empty. Provide the CSV text, including its header row.",
        );
    }
    if (bytes > options.maxBytes) {
        throw new Error(
            `csvContent is ${bytes} bytes, above the ${options.maxBytes} byte limit for inline CSV. Use csvPath for larger data (a file on the server's machine).`,
        );
    }
    const csv = stripUtf8Bom(raw);
    const header = readCsvHeaderText(csv);
    assertCleanHeaders(header.headers, "CSV content");
    assertRequiredColumns(header.headers, options.required, "CSV content");
    const scan = scanCsvText(csv, header.bodyStart);
    assertDataRows(scan);
    assertUniformLineEndings(scan, header.lineEnding, "CSV content");
    return {
        csv,
        lineEnding: header.lineEnding,
        rowCount: scan.rows,
    };
};

/** Reads the header row, its line ending and any BOM from an open file. */
export const readCsvHeaderFromFd = (fd: number): CsvHeaderInfo => {
    const buffer = Buffer.alloc(HEADER_READ_BYTES);
    const bytes = readSync(fd, buffer, 0, buffer.length, 0);
    const bomLength =
        bytes >= UTF8_BOM.length && buffer.subarray(0, 3).equals(UTF8_BOM)
            ? UTF8_BOM.length
            : 0;
    const text = buffer.toString("utf8", bomLength, bytes);
    if (bytes >= HEADER_READ_BYTES && !/\r?\n/.test(text)) {
        throw new Error("CSV header row is too long");
    }
    const header = readCsvHeaderText(text);
    return {
        headers: header.headers,
        lineEnding: header.lineEnding,
        bomLength,
        bodyStart:
            bomLength +
            Buffer.byteLength(text.slice(0, header.bodyStart), "utf8"),
    };
};

export interface OpenedCsv {
    /** Open descriptor, pinned to the validated file. Caller must close it. */
    fd: number;
    /** Real path the file was validated at. */
    path: string;
    fileName: string;
    header: CsvHeaderInfo;
}

/**
 * Validates a CSV input path, opens it once, and reads its header from that
 * descriptor. The descriptor is then checked against the path again, so a
 * file swapped in after validation is refused. Uploads stream from the same
 * descriptor, which closes the check-then-read gap.
 */
export const openCsvInput = (
    csvPath: string,
    required: string[] = [],
): OpenedCsv => {
    if (!isAbsolute(csvPath)) {
        throw new Error("csvPath must be an absolute path");
    }
    const lexical = resolve(csvPath);
    if (extname(lexical).toLowerCase() !== ".csv") {
        throw new Error("csvPath must point to a .csv file");
    }
    let real: string;
    try {
        real = realpathSync(lexical);
    } catch {
        throw new Error(`CSV file not found: ${basenameOf(lexical)}`);
    }
    // Checked before open: opening a FIFO would block until a writer appears.
    if (!statSync(real).isFile()) {
        throw new Error("csvPath must point to a regular file");
    }

    const fd = openSync(real, "r");
    try {
        const stats = fstatSync(fd);
        if (!stats.isFile()) {
            throw new Error("csvPath must point to a regular file");
        }
        if (stats.size === 0) {
            throw new Error("CSV file is empty");
        }
        if (stats.size > MAX_CSV_BYTES) {
            throw new Error(
                `CSV file is ${stats.size} bytes, above the ${MAX_CSV_BYTES} byte limit for one Bulk API upload. Split it into smaller files.`,
            );
        }
        // The path must still resolve to the same file the descriptor holds.
        const now = realpathSync(lexical);
        const current = statSync(now);
        if (current.ino !== stats.ino || current.dev !== stats.dev) {
            throw new Error(
                "CSV file changed while it was being opened. Try again.",
            );
        }
        const header = readCsvHeaderFromFd(fd);
        const scan = scanCsvFd(fd, stats.size, header.bodyStart);
        // Same order as inspectCsvText: blank input first, then header names,
        // then required columns, then data rows.
        if (!scan.text && header.headers.join("").trim() === "") {
            throw new Error("CSV file is empty");
        }
        assertCleanHeaders(header.headers, "CSV file");
        assertRequiredColumns(header.headers, required, "CSV file");
        assertDataRows(scan);
        assertUniformLineEndings(scan, header.lineEnding, "CSV file");
        return {
            fd,
            path: now,
            fileName: basenameOf(now),
            header,
        };
    } catch (error) {
        closeSync(fd);
        throw error;
    }
};

const basenameOf = (path: string): string => path.split(sep).pop() ?? path;

/**
 * Resolves and creates the folder for result files. A caller-supplied
 * outputDir must be absolute. The folder itself must not be a symbolic link
 * or a non-directory, checked before and after creation.
 */
export const resolveOutputDir = (
    defaultDir: string,
    outputDir?: string,
): { dir: string; custom: boolean } => {
    if (outputDir !== undefined && !isAbsolute(outputDir)) {
        throw new Error("outputDir must be an absolute path");
    }
    const dir = outputDir !== undefined ? resolve(outputDir) : defaultDir;
    assertDirectorySlot(dir);
    mkdirSync(dir, { recursive: true });
    assertDirectorySlot(dir);
    return { dir, custom: outputDir !== undefined };
};

/** Refuses a result folder that is a symlink or exists as something else. */
const assertDirectorySlot = (dir: string): void => {
    if (!exists(dir)) return;
    const stats = lstatSync(dir);
    if (stats.isSymbolicLink()) {
        throw new Error(`Result folder must not be a symbolic link: ${dir}`);
    }
    if (!stats.isDirectory()) {
        throw new Error(`Result folder is not a directory: ${dir}`);
    }
};

/** True when something exists at the path, including a dangling symlink. */
const exists = (path: string): boolean => {
    try {
        lstatSync(path);
        return true;
    } catch {
        return false;
    }
};

/**
 * Checks result file targets before anything is written. Symlinks are always
 * refused. With a custom output directory, existing files are refused too,
 * so a caller-chosen folder never has its files replaced silently.
 */
export const assertWritableTargets = (
    paths: string[],
    refuseExisting: boolean,
): void => {
    for (const path of paths) {
        if (!exists(path)) continue;
        if (lstatSync(path).isSymbolicLink()) {
            throw new Error(
                `Refusing to write through a symbolic link: ${basenameOf(path)}`,
            );
        }
        if (refuseExisting) {
            throw new Error(
                `${basenameOf(path)} already exists in the chosen output directory. Use an empty directory or omit outputDir.`,
            );
        }
    }
};

/**
 * Writes one result file. O_NOFOLLOW makes the open fail on a symlink that
 * appears after the check; O_EXCL is used when existing files must be kept.
 */
export const writeResultFile = (
    path: string,
    content: string,
    refuseExisting: boolean,
): void => {
    const flags =
        fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_TRUNC |
        (fsConstants.O_NOFOLLOW ?? 0) |
        (refuseExisting ? fsConstants.O_EXCL : 0);
    const fd = openSync(path, flags, 0o644);
    try {
        writeSync(fd, content);
    } finally {
        closeSync(fd);
    }
};
