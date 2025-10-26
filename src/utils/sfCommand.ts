import { exec } from "node:child_process";
import { platform } from "node:os";
import { existsSync } from "node:fs";

let cachedSfPath: string | null = null;

const COMMON_SF_PATHS = {
    darwin: [
        "/usr/local/bin/sf",
        "/opt/homebrew/bin/sf",
        "/usr/bin/sf",
        process.env.HOME + "/.local/bin/sf",
    ],
    linux: [
        "/usr/local/bin/sf",
        "/usr/bin/sf",
        "/opt/salesforce/cli/bin/sf",
        process.env.HOME + "/.local/bin/sf",
    ],
    win32: [
        "C:\\Program Files\\sf\\bin\\sf.cmd",
        "C:\\Program Files\\sf\\bin\\sf.exe",
        "C:\\Program Files (x86)\\sf\\bin\\sf.cmd",
        "C:\\Program Files (x86)\\sf\\bin\\sf.exe",
        process.env.LOCALAPPDATA + "\\sf\\bin\\sf.cmd",
        process.env.LOCALAPPDATA + "\\sf\\bin\\sf.exe",
    ],
};

function findSfPath(): string {
    if (cachedSfPath) {
        return cachedSfPath;
    }

    const currentPlatform = platform();
    const pathsToCheck =
        COMMON_SF_PATHS[currentPlatform as keyof typeof COMMON_SF_PATHS] ||
        COMMON_SF_PATHS.linux;

    for (const path of pathsToCheck) {
        if (path && existsSync(path)) {
            cachedSfPath = path;
            return path;
        }
    }

    cachedSfPath = "sf";
    return "sf";
}

export function executeSfCommand(command: string): Promise<any> {
    const sfPath = findSfPath();
    // Only quote the path if it contains spaces (indicating it's a full path, not a command name)
    const quotedPath = sfPath.includes(" ") ? `"${sfPath}"` : sfPath;
    const fullCommand = command.replace(/^sf\s+/, `${quotedPath} `);

    return new Promise((resolve, reject) => {
        exec(
            fullCommand,
            { maxBuffer: 50 * 1024 * 1024 },
            (error, stdout, stderr) => {
                if (error) {
                    if (
                        error.message.includes("command not found") ||
                        error.message.includes("is not recognized")
                    ) {
                        reject(
                            new Error(
                                "Salesforce CLI (sf) not found. Please ensure it is installed and accessible. " +
                                    "Visit https://developer.salesforce.com/tools/salesforcecli for installation instructions.",
                            ),
                        );
                        return;
                    }
                    // When --json flag is used, SF CLI returns errors as JSON in stdout
                    // Try to parse stdout as JSON error response
                    if (stdout && stdout.trim().length > 0) {
                        try {
                            const result = JSON.parse(stdout);
                            // If it's a valid JSON response (error or success), return it
                            resolve(result);
                            return;
                        } catch (parseError) {
                            // If JSON parsing fails, fall through to reject with original error
                        }
                    }
                    reject(error);
                    return;
                }
                if (stderr && !stderr.includes("Warning")) {
                    reject(new Error(stderr));
                    return;
                }
                try {
                    const result = JSON.parse(stdout);
                    resolve(result);
                } catch (parseError) {
                    reject(parseError);
                }
            },
        );
    });
}

export function executeSfCommandRaw(command: string): Promise<string> {
    const sfPath = findSfPath();
    // Only quote the path if it contains spaces (indicating it's a full path, not a command name)
    const quotedPath = sfPath.includes(" ") ? `"${sfPath}"` : sfPath;
    const fullCommand = command.replace(/^sf\s+/, `${quotedPath} `);

    return new Promise((resolve, reject) => {
        exec(
            fullCommand,
            { maxBuffer: 50 * 1024 * 1024 },
            (error, stdout, stderr) => {
                if (error) {
                    if (
                        error.message.includes("command not found") ||
                        error.message.includes("is not recognized")
                    ) {
                        reject(
                            new Error(
                                "Salesforce CLI (sf) not found. Please ensure it is installed and accessible. " +
                                    "Visit https://developer.salesforce.com/tools/salesforcecli for installation instructions.",
                            ),
                        );
                    } else {
                        // For scanner commands, non-zero exit code with stdout means violations were found
                        // We should still return the output in this case
                        if (
                            stdout &&
                            (command.includes("scanner") ||
                                command.includes("code-analyzer"))
                        ) {
                            resolve(stdout);
                            return;
                        }
                        reject(error);
                    }
                    return;
                }
                // Return raw stdout without JSON parsing
                resolve(stdout);
            },
        );
    });
}
