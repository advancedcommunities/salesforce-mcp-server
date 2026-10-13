// Run: npm test (builds first, then runs this file against build/)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    escapeCsvField,
    formatCsvValue,
    flattenBulkRecord,
    recordsToBulkCsv,
    idsToBulkCsv,
    BulkCsvError,
} from "../build/utils/bulkCsv.js";

test("escapeCsvField leaves plain values unquoted", () => {
    assert.equal(escapeCsvField("Acme"), "Acme");
    assert.equal(escapeCsvField(""), "");
});

test("escapeCsvField quotes commas, quotes and line breaks (RFC 4180)", () => {
    assert.equal(escapeCsvField("Acme, Inc"), '"Acme, Inc"');
    assert.equal(escapeCsvField('say "hi"'), '"say ""hi"""');
    assert.equal(escapeCsvField("line1\nline2"), '"line1\nline2"');
    assert.equal(escapeCsvField("a\r\nb"), '"a\r\nb"');
});

test("formatCsvValue maps null to #N/A and undefined to an empty cell", () => {
    assert.equal(formatCsvValue(null), "#N/A");
    assert.equal(formatCsvValue(undefined), "");
});

test("formatCsvValue stringifies booleans, numbers and dates", () => {
    assert.equal(formatCsvValue(true), "true");
    assert.equal(formatCsvValue(false), "false");
    assert.equal(formatCsvValue(0), "0");
    assert.equal(formatCsvValue(12.5), "12.5");
    assert.equal(
        formatCsvValue(new Date("2026-01-02T03:04:05.000Z")),
        "2026-01-02T03:04:05.000Z",
    );
});

test("formatCsvValue rejects arrays and invalid dates", () => {
    assert.throws(() => formatCsvValue([1, 2]), BulkCsvError);
    assert.throws(() => formatCsvValue(new Date("nope")), BulkCsvError);
});

test("flattenBulkRecord flattens nested objects to dotted columns", () => {
    const flat = flattenBulkRecord({
        Name: "Acme",
        Account: { ExtId__c: "A-1", Owner: { Alias: "x" } },
    });
    assert.deepEqual(
        [...flat.entries()],
        [
            ["Name", "Acme"],
            ["Account.ExtId__c", "A-1"],
            ["Account.Owner.Alias", "x"],
        ],
    );
});

test("flattenBulkRecord drops the top-level attributes metadata", () => {
    const flat = flattenBulkRecord({
        attributes: { type: "Account", url: "/x" },
        Name: "Acme",
    });
    assert.deepEqual([...flat.keys()], ["Name"]);
});

test("recordsToBulkCsv uses the union of keys as header and blanks missing cells", () => {
    const { csv, headers, rowCount } = recordsToBulkCsv([
        { Name: "Acme", Phone: "555" },
        { Name: "Globex, Ltd", Website: null },
    ]);
    assert.deepEqual(headers, ["Name", "Phone", "Website"]);
    assert.equal(rowCount, 2);
    assert.equal(csv, 'Name,Phone,Website\nAcme,555,\n"Globex, Ltd",,#N/A\n');
});

test("recordsToBulkCsv writes no Id column unless the record supplies one", () => {
    const { csv, headers } = recordsToBulkCsv([
        { ExtId__c: "E-1", Name: "Acme" },
    ]);
    assert.deepEqual(headers, ["ExtId__c", "Name"]);
    assert.equal(csv, "ExtId__c,Name\nE-1,Acme\n");
});

test("recordsToBulkCsv flattens relationship objects", () => {
    const { csv, headers } = recordsToBulkCsv([
        { Name: "Contact A", Account: { ExtId__c: "A-9" } },
    ]);
    assert.deepEqual(headers, ["Name", "Account.ExtId__c"]);
    assert.equal(csv, "Name,Account.ExtId__c\nContact A,A-9\n");
});

test("recordsToBulkCsv quotes embedded quotes and line breaks in values", () => {
    const { csv } = recordsToBulkCsv([{ Description: 'He said "go"\nnow' }]);
    assert.equal(csv, 'Description\n"He said ""go""\nnow"\n');
});

test("recordsToBulkCsv rejects an empty list", () => {
    assert.throws(() => recordsToBulkCsv([]), BulkCsvError);
});

test("idsToBulkCsv produces a single Id column", () => {
    const { csv, headers, rowCount } = idsToBulkCsv([
        "001000000000001AAA",
        "001000000000002AAA",
    ]);
    assert.deepEqual(headers, ["Id"]);
    assert.equal(rowCount, 2);
    assert.equal(csv, "Id\n001000000000001AAA\n001000000000002AAA\n");
});

test("formatCsvValue rejects NaN and infinite numbers locally", () => {
    assert.throws(() => formatCsvValue(NaN), BulkCsvError);
    assert.throws(() => formatCsvValue(Infinity), BulkCsvError);
    assert.throws(() => formatCsvValue(-Infinity), BulkCsvError);
    assert.throws(() => recordsToBulkCsv([{ Amount: NaN }]), BulkCsvError);
    assert.equal(formatCsvValue(-0.5), "-0.5");
});

test("nested SOQL attributes objects are dropped at every depth", () => {
    const record = {
        attributes: { type: "Contact" },
        Id: "003000000000001AAA",
        Account: {
            attributes: { type: "Account", url: "/services/data/x" },
            Id: "001000000000001AAA",
            Name: "Acme",
        },
        LastName: "Doe",
    };
    const { headers, csv } = recordsToBulkCsv([record]);
    assert.deepEqual(headers, ["Id", "Account.Id", "Account.Name", "LastName"]);
    assert.equal(csv.split("\n")[0], "Id,Account.Id,Account.Name,LastName");
});

test("a field literally named attributes with a scalar value is kept below the top level", () => {
    const flat = flattenBulkRecord({ Parent: { attributes: "keep" } });
    assert.deepEqual([...flat.keys()], ["Parent.attributes"]);
});

test("header names with commas and quotes are escaped", () => {
    const { csv } = recordsToBulkCsv([{ "Odd,name": "a", 'say "hi"': "b" }]);
    assert.equal(csv.split("\n")[0], '"Odd,name","say ""hi"""');
});

test("nested null values become #N/A in the matching column", () => {
    const { csv } = recordsToBulkCsv([{ Id: "001", Account: null }]);
    assert.equal(csv, "Id,Account\n001,#N/A\n");
});

test("a record with no fields is rejected", () => {
    assert.throws(() => recordsToBulkCsv([{}]), BulkCsvError);
});
