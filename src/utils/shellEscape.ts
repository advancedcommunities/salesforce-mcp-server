/**
 * Shell escaping for values interpolated into `sf` commands run via
 * child_process.exec().
 *
 * exec() runs through `/bin/sh -c` on macOS/Linux and through
 * `cmd.exe /d /s /c "<command>"` on Windows, and the two need different
 * quoting, so shq() picks the escaper for the current platform.
 *
 * Why not execFile()/spawn() with an argv array: on Windows `sf` is a
 * batch file (sf.cmd, from both the installer and npm). Node refuses to
 * spawn .cmd/.bat files without `shell: true` (CVE-2024-27980), and with
 * `shell: true` Node joins the args with spaces and does no escaping, so
 * a cmd.exe escaper is needed on Windows either way.
 */
export function shq(value: string | number): string {
    return process.platform === "win32"
        ? cmdQuote(String(value))
        : posixQuote(String(value));
}

/**
 * POSIX sh: wrap in single quotes and turn each embedded `'` into `'\''`.
 * Nothing inside single quotes is interpreted by the shell.
 */
export function posixQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

// Characters cmd.exe treats specially outside double quotes.
const CMD_META = /([()\][%!^"`<>&|;, *?])/g;

/**
 * cmd.exe (`cmd /d /s /c "<command>"`, which is what exec() uses).
 *
 * The value is wrapped in double quotes and every cmd metacharacter,
 * including those quotes, is caret-escaped. The `cmd /c` parse removes
 * the carets and leaves `"value"`. When sf is a batch file (sf.cmd) and
 * forwards %*, cmd parses the line again, but by then the value sits
 * inside double quotes where & | < > ( ) ^ are inert, so this holds no
 * matter how many sf.cmd hops there are (the installer's sf.cmd can hand
 * off to a second one under %LOCALAPPDATA%) and also for an sf.exe.
 *
 * Embedded double quotes, CR and LF are rejected rather than escaped: a
 * `"` would end the quoted region on the second parse, and cmd.exe has
 * no escape for a line break.
 */
export function cmdQuote(value: string): string {
    if (/["\r\n]/.test(value)) {
        throw new Error(
            "Values containing double quotes or line breaks cannot be passed safely to the Salesforce CLI on Windows",
        );
    }
    // A trailing backslash would escape the closing quote for the argv parser.
    const quoted = `"${value.replace(/(\\+)$/, "$1$1")}"`;
    return (
        quoted
            .replace(CMD_META, "^$1")
            // %VAR% expansion runs before carets are processed. With a caret
            // right after every `%`, any %name% starts with `^`, which is never
            // a defined variable, so `%PATH%` or `%PATH:a=b%` stays literal.
            .replace(/%(?!\^)/g, "%^")
    );
}

/**
 * Split a value for an oclif `multiple` flag (e.g. --metadata, --tests,
 * --source-dir) on whitespace, keeping double-quoted parts together, so
 * each token can be passed as its own escaped flag. This matches what
 * the shell did with the unquoted value before escaping was added.
 */
export function splitMultiValue(value: string): string[] {
    return (value.match(/(?:"[^"]*"|\S)+/g) ?? []).map((token) =>
        token.replace(/"/g, ""),
    );
}
