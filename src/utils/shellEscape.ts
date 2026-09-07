/**
 * POSIX shell-safe single-quote escaping for values interpolated into
 * commands run via child_process.exec() (which executes through
 * `/bin/sh -c` on macOS/Linux).
 *
 * Wrapping a value in single quotes and escaping any embedded single
 * quote (`'` -> `'\''`) is sufficient to make the value inert to shell
 * metacharacters (spaces, quotes, semicolons, backticks, `$()`, etc.)
 * regardless of its content, because nothing inside a single-quoted
 * string is interpreted by the shell.
 *
 * Scope note: this covers the POSIX shells used on macOS/Linux, which is
 * where exec()'s injection risk is most severe (arbitrary shell metachar
 * execution). Windows' cmd.exe has different, weaker quoting semantics
 * (`^`, `%`, `&`) that single-quote escaping does not address — the
 * long-term fix is moving off exec()/shell-string commands entirely to
 * execFile()/spawn() with an argv array, which sidesteps shell parsing
 * on every platform. Flagging that as a larger follow-up; this change
 * closes the immediate, cross-platform-verified injection path.
 */
export function shq(value: string | number): string {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
