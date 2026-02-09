import { executeSfCommand } from "./sfCommand.js";

let cachedDefaultOrg: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 30_000;

/**
 * Resolve the target org: use the provided value if given,
 * otherwise fall back to the SF CLI default target-org.
 * Results are cached for 30 seconds to avoid repeated subprocess calls.
 */
export async function resolveTargetOrg(targetOrg?: string): Promise<string> {
    if (targetOrg && targetOrg.trim() !== "") {
        return targetOrg;
    }

    const now = Date.now();
    if (cachedDefaultOrg && now - cacheTimestamp < CACHE_TTL_MS) {
        return cachedDefaultOrg;
    }

    try {
        const result = await executeSfCommand("sf config get target-org --json");

        const value = result?.result?.[0]?.value;
        if (value && typeof value === "string" && value.trim() !== "") {
            cachedDefaultOrg = value.trim();
            cacheTimestamp = now;
            return cachedDefaultOrg;
        }
    } catch {
        // fall through to error
    }

    throw new Error(
        "No target org specified and no default org is configured. " +
            "Either provide 'targetOrg' or set a default with: sf config set target-org <alias>",
    );
}

/**
 * Clear the cached default org.
 * Call this after changing the default org via `sf config set target-org`.
 */
export function clearDefaultOrgCache(): void {
    cachedDefaultOrg = null;
    cacheTimestamp = 0;
}

/**
 * Get the currently configured default org, or null if none is set.
 * Uses the same cache as resolveTargetOrg.
 */
export async function getDefaultOrg(): Promise<string | null> {
    const now = Date.now();
    if (cachedDefaultOrg && now - cacheTimestamp < CACHE_TTL_MS) {
        return cachedDefaultOrg;
    }

    try {
        const result = await executeSfCommand("sf config get target-org --json");

        const value = result?.result?.[0]?.value;
        if (value && typeof value === "string" && value.trim() !== "") {
            cachedDefaultOrg = value.trim();
            cacheTimestamp = now;
            return cachedDefaultOrg;
        }
    } catch {
        // ignore
    }

    return null;
}
