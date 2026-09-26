// Run: npm test (builds first, then runs this file against build/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { exec, execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    shq,
    posixQuote,
    cmdQuote,
    splitMultiValue,
} from "../build/utils/shellEscape.js";

const isWindows = process.platform === "win32";

function withPlatform(platform, fn) {
    const original = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: platform });
    try {
        return fn();
    } finally {
        Object.defineProperty(process, "platform", original);
    }
}

test("shq picks the escaper for the current platform", () => {
    withPlatform("linux", () => assert.equal(shq("a b"), posixQuote("a b")));
    withPlatform("darwin", () => assert.equal(shq(42), posixQuote("42")));
    withPlatform("win32", () => assert.equal(shq("a b"), cmdQuote("a b")));
});

// ── POSIX: real /bin/sh round trip ─────────────────────────────────

const marker = join(tmpdir(), `sfmcp-shq-${process.pid}`);
const posixPayloads = [
    `x; touch ${marker}`,
    `$(touch ${marker})`,
    `\`touch ${marker}\``,
    `' ; touch ${marker} ; '`,
    `" ; touch ${marker} ; "`,
    `FIND {test}" ; touch ${marker} ; echo "`,
    `O'Brien`,
    `a && touch ${marker} || touch ${marker} | cat > ${marker}`,
    `line1\nline2; touch ${marker}`,
    `$HOME \\ * ? ~`,
];

test(
    "posixQuote: payloads reach the program as literal text",
    {
        skip: isWindows,
    },
    () => {
        for (const payload of posixPayloads) {
            rmSync(marker, { force: true });
            const out = execFileSync("/bin/sh", [
                "-c",
                `printf '%s' ${posixQuote(payload)}`,
            ]).toString();
            assert.equal(out, payload);
            assert.equal(existsSync(marker), false, payload);
        }
    },
);

test(
    "posixQuote: exec() (the sfCommand.ts path) does not run injected commands",
    {
        skip: isWindows,
    },
    async () => {
        for (const payload of posixPayloads) {
            rmSync(marker, { force: true });
            await new Promise((resolve) =>
                exec(
                    `echo data query --target-org ${posixQuote("org")} --query ${posixQuote(payload)} --json`,
                    () => resolve(),
                ),
            );
            assert.equal(existsSync(marker), false, payload);
        }
        rmSync(marker, { force: true });
    },
);

// ── Windows: escaper logic, checked with a model of cmd.exe parsing ─
//
// This cannot run cmd.exe here. cmdParse() models the parts of cmd.exe's
// command-line parser that matter for injection:
//   phase 1: %name% and %name:...% expand if `name` is a defined variable
//            (undefined ones stay as typed in a `cmd /c` line)
//   phase 2: outside double quotes `^` escapes the next character and is
//            removed, an unescaped `"` toggles quote mode, and unescaped
//            & | < > ( ) outside quotes are live operators.
// exec() runs `cmd /d /s /c "<command>"`. When sf is sf.cmd, the batch
// file's `%*` line is parsed again (phase 2 only; substituted text is not
// re-expanded), possibly more than once.

const ENV = new Set(["PATH", "USERNAME", "COMSPEC"]);

function cmdParse(s, { expandPercent }) {
    const expanded = [];
    if (expandPercent) {
        // Try every `%` as a start, so the model does not depend on how
        // cmd pairs up percent signs.
        for (let i = s.indexOf("%"); i !== -1; i = s.indexOf("%", i + 1)) {
            const m = /^%([^%:]+)(:[^%]*)?%/.exec(s.slice(i));
            if (m && ENV.has(m[1].toUpperCase())) expanded.push(m[0]);
        }
    }
    let out = "";
    let inQuotes = false;
    const live = [];
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (!inQuotes && c === "^") {
            out += s[++i] ?? "";
            continue;
        }
        if (c === '"') inQuotes = !inQuotes;
        else if (!inQuotes && "&|<>()".includes(c)) live.push(c);
        out += c;
    }
    return { out, live, expanded };
}

const windowsPayloads = [
    "my-dev-hub",
    "Name != null & calc &",
    "x | whoami",
    "a && b || c",
    "a ^ b ^& calc",
    "<in >out 2>&1",
    "(x) ) & calc",
    "Name LIKE 'Acme%'",
    "100% %PATH% %path:C=X% %PATH:~0,5% %USERNAME%",
    "%^PATH% %%PATH%%",
    "!USERNAME! ; , =",
    "a b\tc",
    "C:\\Program Files\\dir\\",
];

test("cmdQuote: cmd /c parse yields exactly the quoted value, nothing live or expanded", () => {
    for (const value of windowsPayloads) {
        const first = cmdParse(cmdQuote(value), { expandPercent: true });
        assert.deepEqual(first.live, [], `live operator: ${value}`);
        assert.deepEqual(first.expanded, [], `expanded: ${value}`);
        assert.equal(first.out, `"${value.replace(/(\\+)$/, "$1$1")}"`, value);
    }
});

test("cmdQuote: further sf.cmd %* parses leave the value intact", () => {
    for (const value of windowsPayloads) {
        let text = cmdParse(cmdQuote(value), { expandPercent: true }).out;
        for (let hop = 0; hop < 3; hop++) {
            const next = cmdParse(text, { expandPercent: false });
            assert.deepEqual(next.live, [], `hop ${hop}: ${value}`);
            assert.equal(next.out, text, `hop ${hop}: ${value}`);
            text = next.out;
        }
    }
});

test("cmdQuote: simple values", () => {
    assert.equal(cmdQuote("my-dev-hub"), '^"my-dev-hub^"');
    assert.equal(cmdQuote("a&b"), '^"a^&b^"');
    assert.equal(cmdQuote("50%"), '^"50^%^"');
    assert.equal(cmdQuote("%PATH%"), '^"^%^PATH^%^"');
});

test("cmdQuote: rejects double quotes and line breaks", () => {
    for (const value of ['a"b', '" & calc & "', "a\nb", "a\rb"]) {
        assert.throws(() => cmdQuote(value), /cannot be passed safely/);
    }
});

// ── Multi-value flags ─────────────────────────────────────────────

test("splitMultiValue splits on whitespace and keeps quoted parts", () => {
    assert.deepEqual(splitMultiValue("Test1 Test2"), ["Test1", "Test2"]);
    assert.deepEqual(splitMultiValue("  ApexClass:Foo\tApexClass:Bar  "), [
        "ApexClass:Foo",
        "ApexClass:Bar",
    ]);
    assert.deepEqual(splitMultiValue('Layout:"Account-Account Layout" X'), [
        "Layout:Account-Account Layout",
        "X",
    ]);
    assert.deepEqual(splitMultiValue('"force-app/my dir" force-app/main'), [
        "force-app/my dir",
        "force-app/main",
    ]);
    assert.deepEqual(splitMultiValue("single"), ["single"]);
    assert.deepEqual(splitMultiValue("   "), []);
});

test(
    "multi-value flag: each token becomes its own escaped flag",
    {
        skip: isWindows,
    },
    () => {
        let command = "";
        for (const value of splitMultiValue("Test1 Test2;touch_x")) {
            command += `--tests ${posixQuote(value)} `;
        }
        assert.equal(command, `--tests 'Test1' --tests 'Test2;touch_x' `);
        const argv = JSON.parse(
            execFileSync("/bin/sh", [
                "-c",
                `node -e 'console.log(JSON.stringify(process.argv.slice(1)))' -- ${command}`,
            ]).toString(),
        );
        assert.deepEqual(argv, [
            "--tests",
            "Test1",
            "--tests",
            "Test2;touch_x",
        ]);
    },
);
