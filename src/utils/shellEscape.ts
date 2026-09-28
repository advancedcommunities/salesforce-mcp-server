import { homedir } from "node:os";

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

// $NAME expansion is limited to variables that hold a path or a user name.
// sf echoes paths back in its JSON output, which goes to the MCP client, so
// expanding any variable would let a caller read e.g. SF_ACCESS_TOKEN.
const PATH_VARS =
    /^(?:HOME|USER|LOGNAME|TMPDIR|PWD|OLDPWD|XDG_[A-Z_]+_(?:HOME|DIR))$/;
const VAR_REF = /\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/y;

/**
 * If value[at] starts `$NAME` or `${NAME}` for an allowed variable that is
 * set, return its value and the length of the reference.
 */
function readPathVar(
    value: string,
    at: number,
): { text: string; length: number } | null {
    VAR_REF.lastIndex = at;
    const match = VAR_REF.exec(value);
    const name = match?.[1] ?? match?.[2];
    const text = name && PATH_VARS.test(name) ? process.env[name] : undefined;
    return match && text !== undefined
        ? { text, length: match[0].length }
        : null;
}

/**
 * Split a value for an oclif `multiple` flag (e.g. --metadata, --tests,
 * --source-dir) into tokens, so each one can be passed as its own escaped
 * flag. Before escaping was added these values were interpolated unquoted,
 * so this reproduces the word splitting the shell used to do, quotes
 * removed:
 *   - POSIX (/bin/sh): split on space, tab and newline (the default IFS);
 *     single quotes keep everything literal, double quotes keep whitespace
 *     (a backslash inside them only escapes $ ` " \), and outside quotes a
 *     backslash escapes the next character (`my\ dir` is one token).
 *   - Windows: split on whitespace, keeping double-quoted parts together.
 *     Single quotes are ordinary characters and a backslash is a path
 *     separator, never an escape, just as they were for cmd.exe. A `"`
 *     with no closing partner is dropped, as the earlier version did.
 * On POSIX an unterminated quote runs to the end of the value.
 *
 * With `expandPaths`, tokens are also expanded as expandPath() describes,
 * but only where sh would have expanded them: a `~` that is unquoted and
 * unescaped at the start of a token, and a `$NAME` outside single quotes
 * that is not backslash-escaped. Globs are never expanded.
 */
export function splitMultiValue(
    value: string,
    platform: NodeJS.Platform = process.platform,
    { expandPaths = false }: { expandPaths?: boolean } = {},
): string[] {
    const tokens: string[] = [];
    let token = "";
    // True once the current token has any content, even an empty `''`.
    let inToken = false;
    let quote: "'" | '"' | null = null;
    const posix = platform !== "win32";
    const isSpace = (c: string | undefined) =>
        c !== undefined && (posix ? /[ \t\n]/.test(c) : /\s/.test(c));
    // Appends an allowed $NAME at value[i], returning the new index.
    const appendVar = (i: number) => {
        const ref = expandPaths && posix ? readPathVar(value, i) : null;
        if (!ref) {
            token += "$";
            return i;
        }
        token += ref.text;
        return i + ref.length - 1;
    };

    for (let i = 0; i < value.length; i++) {
        const c = value[i];
        if (quote === "'") {
            if (c === "'") quote = null;
            else token += c;
        } else if (quote === '"') {
            if (c === '"') quote = null;
            else if (
                posix &&
                c === "\\" &&
                /[$`"\\]/.test(value[i + 1] ?? "")
            ) {
                token += value[++i];
            } else if (c === "$") i = appendVar(i);
            else token += c;
        } else if (isSpace(c)) {
            if (inToken) tokens.push(token);
            token = "";
            inToken = false;
        } else {
            const next = value[i + 1];
            if (
                expandPaths &&
                !inToken &&
                c === "~" &&
                (next === undefined ||
                    next === "/" ||
                    (!posix && next === "\\") ||
                    isSpace(next))
            ) {
                token += homedir();
            } else if (c === '"' || (posix && c === "'")) {
                // On Windows a lone `"` is dropped, matching the earlier regex.
                if (posix || value.includes('"', i + 1)) quote = c;
            } else if (posix && c === "\\" && next !== undefined) {
                // Backslash-newline is a line continuation and is dropped.
                i++;
                if (next !== "\n") token += next;
            } else if (c === "$") i = appendVar(i);
            else token += c;
            inToken = true;
        }
    }
    if (inToken) tokens.push(token);
    return tokens;
}

/**
 * Expand a single-value path flag (e.g. --output-dir, --manifest) the way
 * the shell did when path flags were still interpolated unquoted: a
 * leading `~` or `~/` (also `~\` on Windows) becomes os.homedir(), and on
 * POSIX `$NAME` and `${NAME}` are replaced from process.env for path-like
 * variables only (HOME, USER, LOGNAME, TMPDIR, PWD, OLDPWD, XDG_*_HOME,
 * XDG_*_DIR). Any other variable, and an unset one, is left as typed
 * instead of becoming empty, so it cannot leak a secret or silently turn
 * into a different path. `~user`, `%VAR%` and globs are not expanded.
 *
 * On POSIX one pair of quotes around the whole value is removed, since
 * quoting was how a path with spaces had to be passed before: `'...'` is
 * then taken literally and `"..."` only gets $NAME expanded, as in sh.
 * Other quote characters and backslashes are kept literally (the value is
 * not split, so `my dir` needs no quoting now). The result is still
 * passed through shq(), so expansion cannot inject.
 */
export function expandPath(
    value: string,
    platform: NodeJS.Platform = process.platform,
): string {
    if (platform === "win32") {
        return /^~(?=$|[\\/])/.test(value) ? homedir() + value.slice(1) : value;
    }
    const outer = /^(['"]).*\1$/s.exec(value)?.[1];
    if (outer === "'") return value.slice(1, -1);
    let rest = outer ? value.slice(1, -1) : value;
    let home = "";
    if (!outer && /^~(?=$|\/)/.test(rest)) {
        home = homedir();
        rest = rest.slice(1);
    }
    let out = "";
    for (let i = 0; i < rest.length; i++) {
        const ref = rest[i] === "$" ? readPathVar(rest, i) : null;
        if (ref) {
            out += ref.text;
            i += ref.length - 1;
        } else out += rest[i];
    }
    return home + out;
}
