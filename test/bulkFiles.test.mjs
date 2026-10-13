// Run: npm test (builds first, then runs this file against build/)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    mkdtempSync,
    mkdirSync,
    readFileSync,
    realpathSync,
    rmSync,
    symlinkSync,
    writeFileSync,
    existsSync,
    readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    assertRequiredColumns,
    assertWritableTargets,
    inspectCsvText,
    openCsvInput,
    parseHeaderLine,
    readCsvHeaderFromFd,
    readCsvHeaderText,
    resolveOutputDir,
    scanCsvText,
    stripUtf8Bom,
    writeResultFile,
} from "../build/utils/bulkFiles.js";
import { closeSync, openSync } from "node:fs";

/**
 * A fresh folder (dir) and a sibling folder (outside) standing in for any
 * other location on disk, both realpath-resolved.
 */
const sandbox = () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), "bulk-files-")));
    const dir = join(base, "work");
    const outside = join(base, "elsewhere");
    mkdirSync(dir);
    mkdirSync(outside);
    return {
        base,
        dir,
        outside,
        cleanup: () => rmSync(base, { recursive: true, force: true }),
    };
};

test("parseHeaderLine handles quoted cells with commas and escaped quotes", () => {
    assert.deepEqual(parseHeaderLine('Id,"Name, Full","say ""hi"""'), [
        "Id",
        "Name, Full",
        'say "hi"',
    ]);
});

test("openCsvInput rejects relative paths, non-csv names, missing and empty files", () => {
    const sb = sandbox();
    try {
        writeFileSync(join(sb.dir, "data.txt"), "Id\n001\n");
        writeFileSync(join(sb.dir, "empty.csv"), "");
        assert.throws(() => openCsvInput("data.csv"), /absolute/);
        assert.throws(() => openCsvInput(join(sb.dir, "data.txt")), /\.csv/);
        assert.throws(
            () => openCsvInput(join(sb.dir, "missing.csv")),
            /not found/,
        );
        assert.throws(() => openCsvInput(join(sb.dir, "empty.csv")), /empty/);
    } finally {
        sb.cleanup();
    }
});

test("openCsvInput refuses a directory named like a CSV file", () => {
    const sb = sandbox();
    try {
        mkdirSync(join(sb.dir, "folder.csv"));
        assert.throws(
            () => openCsvInput(join(sb.dir, "folder.csv")),
            /regular file/,
        );
    } finally {
        sb.cleanup();
    }
});

test("openCsvInput accepts a symlink to a regular .csv file anywhere and opens its real path", () => {
    const sb = sandbox();
    try {
        const target = join(sb.outside, "accounts.csv");
        writeFileSync(target, "Id,Name\n001,Acme\n");
        const link = join(sb.dir, "link.csv");
        symlinkSync(target, link);
        const opened = openCsvInput(link);
        try {
            assert.equal(opened.path, target);
            assert.equal(opened.fileName, "accounts.csv");
            assert.deepEqual(opened.header.headers, ["Id", "Name"]);
        } finally {
            closeSync(opened.fd);
        }
    } finally {
        sb.cleanup();
    }
});

test("openCsvInput refuses a symlink to a folder", () => {
    const sb = sandbox();
    try {
        const link = join(sb.dir, "linked.csv");
        symlinkSync(sb.outside, link);
        assert.throws(() => openCsvInput(link), /regular file/);
    } finally {
        sb.cleanup();
    }
});

test("header reading: BOM is reported, and line ending follows the header break only", () => {
    const sb = sandbox();
    try {
        const cases = {
            "bom.csv": { content: "﻿Name,Desc\nA,x\n", bom: 3, eol: "LF" },
            "lf-with-crlf-in-quotes.csv": {
                content: 'Name,Description\nA,"x\r\ny"\nB,plain\n',
                bom: 0,
                eol: "LF",
            },
            "crlf.csv": {
                content: "Name,Desc\r\nA,x\r\n",
                bom: 0,
                eol: "CRLF",
            },
        };
        for (const [name, expected] of Object.entries(cases)) {
            const path = join(sb.dir, name);
            writeFileSync(path, expected.content, "utf8");
            const opened = openCsvInput(path);
            try {
                assert.equal(opened.header.bomLength, expected.bom, name);
                assert.equal(opened.header.lineEnding, expected.eol, name);
                assert.equal(
                    opened.header.headers.includes("Name"),
                    true,
                    name,
                );
            } finally {
                closeSync(opened.fd);
            }
        }
    } finally {
        sb.cleanup();
    }
});

test("readCsvHeaderFromFd parses a quoted header with a comma", () => {
    const sb = sandbox();
    try {
        const path = join(sb.dir, "h.csv");
        writeFileSync(path, 'Id,"Name, Full"\n001,x\n');
        const fd = openSync(path, "r");
        try {
            assert.deepEqual(readCsvHeaderFromFd(fd).headers, [
                "Id",
                "Name, Full",
            ]);
        } finally {
            closeSync(fd);
        }
    } finally {
        sb.cleanup();
    }
});

test("resolveOutputDir uses the default folder when outputDir is omitted", () => {
    const sb = sandbox();
    try {
        const defaultDir = join(sb.dir, "salesforce-bulk-results", "750ABC");
        const { dir, custom } = resolveOutputDir(defaultDir);
        assert.equal(dir, defaultDir);
        assert.equal(custom, false);
        assert.equal(existsSync(dir), true);
    } finally {
        sb.cleanup();
    }
});

test("resolveOutputDir creates a custom folder anywhere absolute", () => {
    const sb = sandbox();
    try {
        const target = join(sb.outside, "new", "job1");
        const { dir, custom } = resolveOutputDir(
            join(sb.dir, "unused"),
            target,
        );
        assert.equal(dir, target);
        assert.equal(custom, true);
        assert.equal(existsSync(target), true);
    } finally {
        sb.cleanup();
    }
});

test("resolveOutputDir refuses a symlink as the output folder without writing through it", () => {
    const sb = sandbox();
    try {
        const link = join(sb.dir, "link");
        symlinkSync(sb.outside, link);
        assert.throws(
            () => resolveOutputDir(join(sb.dir, "unused"), link),
            /symbolic link/,
        );
        assert.equal(existsSync(join(sb.outside, "job1")), false);
    } finally {
        sb.cleanup();
    }
});

test("resolveOutputDir refuses a default folder that is a symlink", () => {
    const sb = sandbox();
    try {
        const defaultDir = join(sb.dir, "job1");
        symlinkSync(sb.outside, defaultDir);
        assert.throws(() => resolveOutputDir(defaultDir), /symbolic link/);
    } finally {
        sb.cleanup();
    }
});

test("resolveOutputDir refuses an output path that is a file", () => {
    const sb = sandbox();
    try {
        const file = join(sb.dir, "not-a-folder");
        writeFileSync(file, "x");
        assert.throws(
            () => resolveOutputDir(join(sb.dir, "unused"), file),
            /not a directory/,
        );
    } finally {
        sb.cleanup();
    }
});

test("resolveOutputDir rejects a relative output directory", () => {
    const sb = sandbox();
    try {
        assert.throws(
            () => resolveOutputDir(sb.dir, "relative/dir"),
            /absolute/,
        );
    } finally {
        sb.cleanup();
    }
});

test("writeResultFile refuses to write through a symlink", () => {
    const sb = sandbox();
    try {
        const target = join(sb.outside, "target.txt");
        writeFileSync(target, "original");
        const linkPath = join(sb.dir, "failed-results.csv");
        symlinkSync(target, linkPath);
        assert.throws(
            () => assertWritableTargets([linkPath], false),
            /symbolic link/,
        );
        assert.throws(() => writeResultFile(linkPath, "new", false));
        assert.equal(readFileSync(target, "utf8"), "original");
    } finally {
        sb.cleanup();
    }
});

test("custom output directories refuse existing result files; default ones overwrite", () => {
    const sb = sandbox();
    try {
        const existing = join(sb.dir, "failed-results.csv");
        writeFileSync(existing, "old");
        assert.throws(
            () => assertWritableTargets([existing], true),
            /already exists/,
        );
        assert.doesNotThrow(() => assertWritableTargets([existing], false));
        writeResultFile(existing, "new", false);
        assert.equal(readFileSync(existing, "utf8"), "new");
        assert.throws(() => writeResultFile(existing, "newer", true));
        assert.equal(readFileSync(existing, "utf8"), "new");
        assert.deepEqual(readdirSync(sb.dir), ["failed-results.csv"]);
    } finally {
        sb.cleanup();
    }
});

test("readCsvHeaderText reads headers, line ending and where data starts", () => {
    const lf = readCsvHeaderText("Id,Name\n001,A\n");
    assert.deepEqual(lf.headers, ["Id", "Name"]);
    assert.equal(lf.lineEnding, "LF");
    assert.equal(lf.bodyStart, "Id,Name\n".length);

    const crlf = readCsvHeaderText('Id,"Name, Full"\r\n001,A\r\n');
    assert.deepEqual(crlf.headers, ["Id", "Name, Full"]);
    assert.equal(crlf.lineEnding, "CRLF");
    assert.equal(crlf.bodyStart, 'Id,"Name, Full"\r\n'.length);

    const headerOnly = readCsvHeaderText("Id,Name");
    assert.equal(headerOnly.bodyStart, "Id,Name".length);
    assert.equal(headerOnly.lineEnding, "LF");
});

test("stripUtf8Bom removes one leading BOM and nothing else", () => {
    assert.equal(stripUtf8Bom("\uFEFFId,Name\n"), "Id,Name\n");
    assert.equal(stripUtf8Bom("Id,Name\n"), "Id,Name\n");
    assert.equal(stripUtf8Bom("Id\uFEFF"), "Id\uFEFF");
});

test("scanCsvText ignores line breaks inside quotes and blank lines", () => {
    const body = (text) =>
        scanCsvText(text, readCsvHeaderText(text).bodyStart).rows;
    assert.equal(body('Id\n001,"a\nb"\n002,c\n'), 2);
    assert.equal(body("Id\r\n001,a\r\n002,b\r\n"), 2);
    assert.equal(body("Id\n001,a\n\n\n002,b"), 2);
    assert.equal(body('Id\n"he said ""hi"""\n'), 1);
    assert.equal(body("Id\n"), 0);
    assert.equal(body("Id"), 0);
});

test("inspectCsvText strips a BOM and keeps the header's CRLF line ending", () => {
    const info = inspectCsvText("\uFEFFId,Name\r\n001,A\r\n002,B\r\n", {
        required: ["Id"],
        maxBytes: 1024,
    });
    assert.equal(info.csv, "Id,Name\r\n001,A\r\n002,B\r\n");
    assert.equal(info.lineEnding, "CRLF");
    assert.equal(info.rowCount, 2);
});

test("inspectCsvText rejects empty, whitespace-only and BOM-only content", () => {
    for (const raw of ["", "  \n\t", "\uFEFF", "\uFEFF\r\n"]) {
        assert.throws(
            () => inspectCsvText(raw, { required: ["Id"], maxBytes: 1024 }),
            /csvContent is empty/,
            JSON.stringify(raw),
        );
    }
});

test("inspectCsvText rejects a header with no data rows", () => {
    assert.throws(
        () =>
            inspectCsvText("Id,Name\r\n", { required: ["Id"], maxBytes: 1024 }),
        /no data rows/,
    );
    assert.throws(
        () => inspectCsvText("Id,Name", { required: ["Id"], maxBytes: 1024 }),
        /no data rows/,
    );
});

test("inspectCsvText treats whitespace-only lines as blank, not data rows", () => {
    for (const raw of ["Id\n   \n", "Id\r\n\t\r\n", "Id\n \n \n"]) {
        assert.throws(
            () => inspectCsvText(raw, { required: ["Id"], maxBytes: 1024 }),
            /no data rows/,
            JSON.stringify(raw),
        );
    }
    assert.equal(
        inspectCsvText("Id\n  \nx\n", { required: ["Id"], maxBytes: 1024 })
            .rowCount,
        1,
    );
});

test("inspectCsvText checks required columns against the header", () => {
    assert.throws(
        () =>
            inspectCsvText("Name\nAcme\n", {
                required: ["Id"],
                maxBytes: 1024,
            }),
        /CSV content must have a 'Id' column/,
    );
    assert.throws(
        () =>
            inspectCsvText("Name\nAcme\n", {
                required: ["ExtId__c"],
                maxBytes: 1024,
            }),
        /'ExtId__c' column/,
    );
});

test("inspectCsvText measures the size cap in UTF-8 bytes and suggests csvPath", () => {
    // "é" is one character but two UTF-8 bytes.
    const raw = "Id,Name\n001,\u00e9\u00e9\n";
    const bytes = Buffer.byteLength(raw, "utf8");
    assert.equal(bytes, 17);
    assert.doesNotThrow(() =>
        inspectCsvText(raw, { required: ["Id"], maxBytes: bytes }),
    );
    assert.throws(
        () => inspectCsvText(raw, { required: ["Id"], maxBytes: bytes - 1 }),
        (error) =>
            /17 bytes, above the 16 byte limit/.test(error.message) &&
            /csvPath/.test(error.message),
    );
});

test("assertRequiredColumns names the source in its message", () => {
    assert.doesNotThrow(() =>
        assertRequiredColumns(["Id", "X"], ["Id"], "CSV file"),
    );
    assert.throws(
        () => assertRequiredColumns(["X"], ["Id"], "CSV file"),
        /CSV file must have a 'Id' column/,
    );
});

test("scanCsvText treats a stray quote in an unquoted cell as text", () => {
    const rows = 601;
    const body = (quoteInRowOne) => {
        let text = "Name,Desc\n";
        for (let i = 1; i <= rows; i++) {
            const name = i === 1 && quoteInRowOne ? 'Acme "Co.' : `Acme ${i}`;
            text += `${name},line ${i}\n`;
        }
        return text;
    };
    const count = (text) =>
        scanCsvText(text, readCsvHeaderText(text).bodyStart).rows;
    assert.equal(count(body(false)), rows);
    assert.equal(count(body(true)), rows);
});

test("scanCsvText still joins a quoted cell with a line break and an escaped quote", () => {
    const text = 'Name,Desc\nA,"x\ny"\nB,"say ""hi"""\nC,plain "quote" here\n';
    const count = scanCsvText(text, readCsvHeaderText(text).bodyStart).rows;
    assert.equal(count, 3);
});

test("inspectCsvText counts more than 500 rows when a stray quote is present", () => {
    let text = "Id,Name\n";
    for (let i = 0; i < 600; i++) {
        text += `001${String(i).padStart(12, "0")},Acme ${i === 0 ? '"Co' : i}\n`;
    }
    const info = inspectCsvText(text, { required: ["Id"], maxBytes: 1 << 20 });
    assert.equal(info.rowCount, 600);
});

test("inspectCsvText rejects a header name with surrounding spaces", () => {
    assert.throws(
        () =>
            inspectCsvText("Id ,Name\n001,A\n", {
                required: ["Id"],
                maxBytes: 1024,
            }),
        /leading or trailing spaces: 'Id '/,
    );
    assert.throws(
        () =>
            inspectCsvText('Id," Name"\n001,A\n', {
                required: ["Id"],
                maxBytes: 1024,
            }),
        /leading or trailing spaces/,
    );
});

test("parseHeaderLine returns names as written", () => {
    assert.deepEqual(parseHeaderLine("Id , Name"), ["Id ", " Name"]);
});

test("inspectCsvText rejects mixed line endings and names the header ending", () => {
    assert.throws(
        () =>
            inspectCsvText("Name,Phone\r\nA,555-1\nB,555-2\n", {
                required: ["Name"],
                maxBytes: 1024,
            }),
        /mixes line endings: its header row ends in CRLF, but 2 line break\(s\) end in LF/,
    );
    assert.throws(
        () =>
            inspectCsvText("Name,Phone\nA,555-1\r\n", {
                required: ["Name"],
                maxBytes: 1024,
            }),
        /header row ends in LF, but 1 line break/,
    );
});

test("inspectCsvText allows a bare line break inside a quoted cell", () => {
    const info = inspectCsvText('Name\r\n"A\ny"\r\nB\r\n', {
        required: ["Name"],
        maxBytes: 1024,
    });
    assert.equal(info.rowCount, 2);
    assert.equal(info.lineEnding, "CRLF");
});

test("openCsvInput refuses a file with mixed line endings and closes it", () => {
    const box = sandbox();
    try {
        const file = join(box.dir, "mixed.csv");
        writeFileSync(file, "Name\r\nA\nB\r\n");
        assert.throws(() => openCsvInput(file), /mixes line endings/);
    } finally {
        box.cleanup();
    }
});

test("openCsvInput refuses a header name with surrounding spaces", () => {
    const box = sandbox();
    try {
        const file = join(box.dir, "padded.csv");
        writeFileSync(file, "Id ,Name\n001,A\n");
        assert.throws(() => openCsvInput(file), /leading or trailing spaces/);
    } finally {
        box.cleanup();
    }
});

test("openCsvInput reports blank-only files as csvContent does, and checks required columns before rows", () => {
    const sb = sandbox();
    try {
        const path = join(sb.dir, "blank-only.csv");
        for (const text of ["\n\n", "   \n\t\n", "\uFEFF\r\n"]) {
            writeFileSync(path, text);
            assert.throws(
                () => openCsvInput(path, ["Id"]),
                /CSV file is empty/,
                JSON.stringify(text),
            );
            assert.throws(
                () =>
                    inspectCsvText(text, { required: ["Id"], maxBytes: 1024 }),
                /csvContent is empty/,
                JSON.stringify(text),
            );
        }
        writeFileSync(path, "Name,Phone\n");
        assert.throws(
            () => openCsvInput(path, ["Id"]),
            /must have a 'Id' column/,
        );
        assert.throws(
            () =>
                inspectCsvText("Name,Phone\n", {
                    required: ["Id"],
                    maxBytes: 1024,
                }),
            /must have a 'Id' column/,
        );
    } finally {
        sb.cleanup();
    }
});

test("openCsvInput refuses a header with no data rows or only blank lines, as csvContent does", () => {
    const sb = sandbox();
    try {
        const texts = [
            "Id,Name\n",
            "Id,Name",
            "Id,Name\r\n\r\n\n",
            "Id,Name\n   \n",
            "Id,Name\n\t\r\n",
        ];
        texts.forEach((text, i) => {
            const path = join(sb.dir, `no-rows-${i}.csv`);
            writeFileSync(path, text);
            assert.throws(
                () => openCsvInput(path),
                /The CSV has a header row but no data rows/,
                JSON.stringify(text),
            );
        });
        assert.throws(
            () =>
                inspectCsvText("Id,Name\n", {
                    required: ["Id"],
                    maxBytes: 1024,
                }),
            /The CSV has a header row but no data rows/,
        );

        const path = join(sb.dir, "one-row.csv");
        writeFileSync(path, "Id,Name\n001000000000001AAA,A\n");
        const file = openCsvInput(path);
        closeSync(file.fd);
    } finally {
        sb.cleanup();
    }
});
