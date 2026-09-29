import { executeSfCommand } from "./sfCommand.js";
import { listAllOrgs, type OrgAuthorization } from "../shared/connection.js";
import {
    toClientOrgReference,
    type ClientOrgReference,
} from "./maskIdentifiers.js";

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
        const result = await executeSfCommand(
            "sf config get target-org --json",
        );

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
        const result = await executeSfCommand(
            "sf config get target-org --json",
        );

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

/**
 * Get the default org in a form that is safe to return to the AI client:
 * its alias when one exists, otherwise a masked username plus a hint to set
 * an alias. Never exposes the raw username, org ID or instance URL. Tools that
 * run commands must keep using resolveTargetOrg()/getDefaultOrg().
 */
export async function getDefaultOrgForClient(): Promise<ClientOrgReference> {
    const value = await getDefaultOrg();
    if (!value) return { org: null, isAlias: false };

    return toClientOrgReference(value, await tryListAllOrgs());
}

/**
 * Lists authenticated orgs, returning null (instead of throwing) when the
 * list can't be read, e.g. because of a corrupt auth file or keychain error.
 */
const tryListAllOrgs = async (): Promise<OrgAuthorization[] | null> => {
    try {
        return await listAllOrgs();
    } catch {
        return null;
    }
};

/**
 * Converts a resolved target org (from resolveTargetOrg) into a label that is
 * safe to echo back to the AI client. Aliases are returned unchanged without
 * any lookup; a username is replaced with its first alias, or masked when it
 * has none. Use it for every `targetOrg` field or message sent to the client;
 * keep passing the raw value to CLI commands.
 */
export async function toClientOrgLabel(org: string): Promise<string> {
    if (!org.includes("@")) return org;
    return toClientOrgReference(org, await tryListAllOrgs()).org ?? org;
}
