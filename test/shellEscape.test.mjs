// Run: npm test (builds first, then runs this file against build/)
import { test } from "node:test";
import assert from "node:assert/strict";
import { exec, execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
    shq,
    posixQuote,
    cmdQuote,
    splitMultiValue,
    expandPath,
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

test("splitMultiValue splits on whitespace and keeps double-quoted parts", () => {
    for (const platform of ["linux", "win32"]) {
        const split = (v) => splitMultiValue(v, platform);
        assert.deepEqual(split("Test1 Test2"), ["Test1", "Test2"]);
        assert.deepEqual(split("  ApexClass:Foo\tApexClass:Bar  "), [
            "ApexClass:Foo",
            "ApexClass:Bar",
        ]);
        assert.deepEqual(split('Layout:"Account-Account Layout" X'), [
            "Layout:Account-Account Layout",
            "X",
        ]);
        assert.deepEqual(split('"force-app/my dir" force-app/main'), [
            "force-app/my dir",
            "force-app/main",
        ]);
        assert.deepEqual(split("single"), ["single"]);
        assert.deepEqual(split("   "), []);
    }
});

test("splitMultiValue defaults to the current platform", () => {
    const value = "'a b' c\\ d";
    withPlatform("linux", () =>
        assert.deepEqual(splitMultiValue(value), ["a b", "c d"]),
    );
    withPlatform("win32", () =>
        assert.deepEqual(splitMultiValue(value), ["'a", "b'", "c\\", "d"]),
    );
});

test("splitMultiValue on POSIX honors single quotes and backslashes", () => {
    const split = (v) => splitMultiValue(v, "darwin");
    assert.deepEqual(split("'Layout:Account-Account Layout' X"), [
        "Layout:Account-Account Layout",
        "X",
    ]);
    assert.deepEqual(split("force-app/my\\ dir force-app/main"), [
        "force-app/my dir",
        "force-app/main",
    ]);
    assert.deepEqual(split(`'say "hi"' "it's" a\\'b`), [
        'say "hi"',
        "it's",
        "a'b",
    ]);
    assert.deepEqual(split('"a\\"b\\\\c\\d"'), ['a"b\\c\\d']);
    assert.deepEqual(split("'' x"), ["", "x"]);
});

test("splitMultiValue on Windows keeps backslashes and single quotes", () => {
    const split = (v) => splitMultiValue(v, "win32");
    assert.deepEqual(split("C:\\proj\\force-app 'x y'"), [
        "C:\\proj\\force-app",
        "'x",
        "y'",
    ]);
    assert.deepEqual(split('"C:\\my dir\\" D:\\x'), ["C:\\my dir\\", "D:\\x"]);
});

test("splitMultiValue on Windows drops a lone quote like the earlier regex", () => {
    const split = (v) => splitMultiValue(v, "win32");
    assert.deepEqual(split('"unterminated x'), ["unterminated", "x"]);
    assert.deepEqual(split('x "Foo Bar'), ["x", "Foo", "Bar"]);
    assert.deepEqual(split('"a b" "c d'), ["a b", "c", "d"]);
});

const shSplitCases = [
    "Test1 Test2",
    "'Layout:Account-Account Layout' ApexClass:Foo",
    'Layout:"Account-Account Layout"',
    "force-app/my\\ dir force-app/main",
    `'say "hi"' "it's" a\\'b`,
    '"a\\"b\\\\c\\d\\$x"',
    "a'b c'd \"e f\"g",
    "'' x",
    "\\;x \\&y",
    "a b c d",
];

test(
    "splitMultiValue on POSIX matches /bin/sh word splitting",
    {
        skip: isWindows,
    },
    () => {
        for (const value of shSplitCases) {
            const argv = JSON.parse(
                execFileSync("/bin/sh", [
                    "-c",
                    `node -e 'console.log(JSON.stringify(process.argv.slice(1)))' -- ${value}`,
                ]).toString(),
            );
            assert.deepEqual(splitMultiValue(value, "linux"), argv, value);
        }
    },
);

// Only set, allowlisted variables: sh turns an unset one into "".
const shExpandCases = [
    `'~'/x \\~/x ~"/x"`,
    `\\$HOME '$HOME' "$HOME"/x`,
    "~ ~/a a~b x/~",
    `\${HOME}x a$HOME "a b"$HOME`,
];

test(
    "splitMultiValue with expandPaths matches /bin/sh expansion",
    {
        skip: isWindows,
    },
    () => {
        for (const value of shExpandCases) {
            const argv = JSON.parse(
                execFileSync("/bin/sh", [
                    "-c",
                    `set -f; node -e 'console.log(JSON.stringify(process.argv.slice(1)))' -- ${value}`,
                ]).toString(),
            );
            assert.deepEqual(
                splitMultiValue(value, "linux", { expandPaths: true }),
                argv,
                value,
            );
        }
    },
);

test("splitMultiValue with expandPaths on Windows expands only ~", () => {
    assert.deepEqual(
        splitMultiValue('~\\proj "~\\x" $HOME', "win32", {
            expandPaths: true,
        }),
        [`${homedir()}\\proj`, "~\\x", "$HOME"],
    );
});

// ── Path expansion ───────────────────────────────────────────────

test("expandPath expands a leading ~ on every platform", () => {
    const home = homedir();
    for (const platform of ["linux", "darwin", "win32"]) {
        assert.equal(expandPath("~", platform), home);
        assert.equal(expandPath("~/proj/x", platform), `${home}/proj/x`);
        assert.equal(expandPath("a/~/b", platform), "a/~/b");
        assert.equal(expandPath("~user/x", platform), "~user/x");
    }
    assert.equal(expandPath("~\\proj", "win32"), `${home}\\proj`);
    assert.equal(expandPath("~\\proj", "linux"), "~\\proj");
});

test("expandPath expands $NAME and ${NAME} on POSIX only", () => {
    process.env.XDG_SFMCP_TEST_DIR = "/work/dir";
    delete process.env.XDG_SFMCP_UNSET_DIR;
    try {
        assert.equal(
            expandPath("$XDG_SFMCP_TEST_DIR/x", "linux"),
            "/work/dir/x",
        );
        assert.equal(
            expandPath("${XDG_SFMCP_TEST_DIR}x", "darwin"),
            "/work/dirx",
        );
        assert.equal(
            expandPath("~/$XDG_SFMCP_TEST_DIR", "linux"),
            `${homedir()}//work/dir`,
        );
        // Unknown variables stay literal instead of becoming empty.
        assert.equal(
            expandPath("$XDG_SFMCP_UNSET_DIR/${XDG_SFMCP_UNSET_DIR}", "linux"),
            "$XDG_SFMCP_UNSET_DIR/${XDG_SFMCP_UNSET_DIR}",
        );
        // Variables that are not path-like are never expanded.
        process.env.SFMCP_TEST_SECRET = "s3cr3t";
        assert.equal(
            expandPath("x/$SFMCP_TEST_SECRET/${SFMCP_TEST_SECRET}", "linux"),
            "x/$SFMCP_TEST_SECRET/${SFMCP_TEST_SECRET}",
        );
        assert.deepEqual(
            splitMultiValue("$SFMCP_TEST_SECRET", "linux", {
                expandPaths: true,
            }),
            ["$SFMCP_TEST_SECRET"],
        );
        assert.equal(
            expandPath("$XDG_SFMCP_TEST_DIR %XDG_SFMCP_TEST_DIR%", "win32"),
            "$XDG_SFMCP_TEST_DIR %XDG_SFMCP_TEST_DIR%",
        );
        withPlatform("linux", () =>
            assert.equal(expandPath("$XDG_SFMCP_TEST_DIR"), "/work/dir"),
        );
    } finally {
        delete process.env.XDG_SFMCP_TEST_DIR;
        delete process.env.SFMCP_TEST_SECRET;
    }
});

test("expandPath on POSIX removes one pair of surrounding quotes", () => {
    const home = homedir();
    assert.equal(expandPath('"my classes"', "linux"), "my classes");
    assert.equal(expandPath("'~/$HOME'", "linux"), "~/$HOME");
    assert.equal(expandPath('"~/$HOME"', "linux"), `~/${process.env.HOME}`);
    assert.equal(
        expandPath("my classes/O'Brien", "linux"),
        "my classes/O'Brien",
    );
    assert.equal(expandPath(`~/"my dir"`, "linux"), `${home}/"my dir"`);
    assert.equal(expandPath('"C:\\my dir"', "win32"), '"C:\\my dir"');
});

test(
    "expandPath output still goes through shq without injection",
    {
        skip: isWindows,
    },
    () => {
        process.env.XDG_SFMCP_EVIL_DIR = `x; touch ${marker}; $(touch ${marker})`;
        try {
            rmSync(marker, { force: true });
            const value = expandPath("$XDG_SFMCP_EVIL_DIR/dir", "linux");
            const out = execFileSync("/bin/sh", [
                "-c",
                `printf '%s' ${posixQuote(value)}`,
            ]).toString();
            assert.equal(out, `${process.env.XDG_SFMCP_EVIL_DIR}/dir`);
            assert.equal(existsSync(marker), false);
        } finally {
            delete process.env.XDG_SFMCP_EVIL_DIR;
            rmSync(marker, { force: true });
        }
    },
);

test(
    "multi-value flag: each token becomes its own escaped flag",
    {
        skip: isWindows,
    },
    () => {
        let command = "";
        for (const value of splitMultiValue("Test1 Test2;touch_x", "linux")) {
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
