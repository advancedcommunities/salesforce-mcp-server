import type { OrgAuthorization } from "../shared/connection.js";

/**
 * Pure helpers for masking Salesforce org identifiers (usernames, org IDs and
 * instance URLs) before they are returned to the AI client. Masking is always
 * on. None of these functions mutate their input.
 */

const MASK = "***";

/**
 * Keeps a short recognizable prefix of a segment and replaces the rest with a
 * fixed-length mask, so the original length is not revealed.
 * - 1 char  -> "***"
 * - 2 chars -> "a***"
 * - 3+      -> "ab***"
 */
const maskSegment = (segment: string): string => {
    if (!segment) return MASK;
    const keep = Math.min(2, segment.length - 1);
    return `${segment.slice(0, keep)}${MASK}`;
};

/**
 * Masks a Salesforce username (email-shaped).
 * "jane.doe@example.com" -> "ja***@ex***.com"
 * "jane@acme.com.uat" (sandbox)               -> "ja***@ac***.uat"
 * Only the first label of the domain (partially) and its last label are kept.
 * Values without "@" are masked as a single segment. Empty/undefined values
 * are returned unchanged.
 */
export function maskUsername(username: string): string;
export function maskUsername(username: string | undefined): string | undefined;
export function maskUsername(username: string | undefined): string | undefined {
    if (!username) return username;

    const atIndex = username.lastIndexOf("@");
    if (atIndex === -1) return maskSegment(username);

    const localPart = username.slice(0, atIndex);
    const domain = username.slice(atIndex + 1);
    const labels = domain.split(".").filter((label) => label.length > 0);

    let maskedDomain: string;
    if (labels.length === 0) {
        maskedDomain = MASK;
    } else if (labels.length === 1) {
        maskedDomain = maskSegment(labels[0]);
    } else {
        maskedDomain = `${maskSegment(labels[0])}.${labels[labels.length - 1]}`;
    }

    return `${maskSegment(localPart)}@${maskedDomain}`;
}

/**
 * Masks a Salesforce org ID, keeping the 3-char key prefix ("00D") and the
 * last 4 characters while preserving the length.
 * "00D5g000004abcdEAA" (18 chars) -> "00D***********dEAA"
 * "00D5g000004abcd"    (15 chars) -> "00D********abcd"
 * Values shorter than 8 characters are fully masked. Empty/undefined values
 * are returned unchanged.
 */
export function maskOrgId(orgId: string): string;
export function maskOrgId(orgId: string | undefined): string | undefined;
export function maskOrgId(orgId: string | undefined): string | undefined {
    if (!orgId) return orgId;
    if (orgId.length < 8) return "*".repeat(orgId.length);
    return `${orgId.slice(0, 3)}${"*".repeat(orgId.length - 7)}${orgId.slice(-4)}`;
}

/**
 * Masks an entry of an org list (e.g. ALLOWED_ORGS) only if it looks like a
 * username; aliases are returned unchanged.
 */
export const maskOrgReference = (value: string): string =>
    value.includes("@") ? maskUsername(value) : value;

/**
 * Known Salesforce host suffixes, longest first so that the most specific one
 * wins. Everything to the left of the suffix is the org's My Domain (or
 * instance) prefix and gets masked; the suffix itself only reveals the org
 * type and is kept.
 */
const SALESFORCE_HOST_SUFFIXES = [
    ".sandbox.my.salesforce.com",
    ".develop.my.salesforce.com",
    ".scratch.my.salesforce.com",
    ".demo.my.salesforce.com",
    ".patch.my.salesforce.com",
    ".trailblaze.my.salesforce.com",
    ".free.my.salesforce.com",
    ".sandbox.my.salesforce-setup.com",
    ".my.salesforce-setup.com",
    ".my.salesforce.com",
    ".sandbox.lightning.force.com",
    ".develop.lightning.force.com",
    ".scratch.lightning.force.com",
    ".demo.lightning.force.com",
    ".patch.lightning.force.com",
    ".trailblaze.lightning.force.com",
    ".lightning.force.com",
    ".sandbox.my.site.com",
    ".develop.my.site.com",
    ".scratch.my.site.com",
    ".my.site.com",
    ".sandbox.my.salesforce-sites.com",
    ".my.salesforce-sites.com",
    ".my.salesforce.mil",
    ".lightning.crmforce.mil",
    ".visualforce.com",
    ".salesforce.com",
    ".force.com",
];

/**
 * Masks a single host label. Sandbox My Domain labels have the form
 * "<mydomain>--<sandboxname>"; both parts are masked independently so
 * neither the company nor the sandbox name is exposed in full:
 * "acme--uat" -> "ac***--ua***", "acme" -> "ac***".
 */
const maskHostLabel = (label: string): string =>
    label.includes("--")
        ? label
              .split("--")
              .map((part) => maskSegment(part))
              .join("--")
        : maskSegment(label);

const maskHost = (host: string): string => {
    const lower = host.toLowerCase();
    const suffix = SALESFORCE_HOST_SUFFIXES.find(
        (candidate) =>
            lower.endsWith(candidate) && lower !== candidate.slice(1),
    );
    if (suffix) {
        const prefix = host.slice(0, host.length - suffix.length);
        const maskedPrefix = prefix.split(".").map(maskHostLabel).join(".");
        return `${maskedPrefix}${host.slice(host.length - suffix.length)}`;
    }
    // Unknown host: mask the leftmost label, keep the rest.
    const labels = host.split(".");
    labels[0] = maskHostLabel(labels[0]);
    return labels.join(".");
};

/**
 * Masks a Salesforce instance URL, keeping the scheme, the Salesforce host
 * suffix and any port, and masking the My Domain part. Paths, query strings
 * and fragments are dropped.
 * "https://acme.my.salesforce.com"                  -> "https://ac***.my.salesforce.com"
 * "https://acme--uat.sandbox.my.salesforce.com"     -> "https://ac***--ua***.sandbox.my.salesforce.com"
 * "https://acme-dev-ed.develop.my.salesforce.com"   -> "https://ac***.develop.my.salesforce.com"
 * "https://example.org"                             -> "https://ex***.org"
 * Values that are not absolute URLs are treated as a bare host (the leftmost
 * label is masked). Empty/undefined values are returned unchanged.
 */
export function maskInstanceUrl(url: string): string;
export function maskInstanceUrl(url: string | undefined): string | undefined;
export function maskInstanceUrl(url: string | undefined): string | undefined {
    if (!url) return url;

    let parsed: URL | undefined;
    try {
        parsed = new URL(url);
    } catch {
        parsed = undefined;
    }

    if (parsed && parsed.hostname) {
        const port = parsed.port ? `:${parsed.port}` : "";
        return `${parsed.protocol}//${maskHost(parsed.hostname)}${port}`;
    }

    // Not a parseable absolute URL: treat everything up to the first "/", "?"
    // or "#" as a host and drop the rest.
    const host = url.trim().split(/[/?#]/)[0];
    if (!host) return MASK;
    return maskHost(host);
}

const URL_PATTERN = /\bhttps?:\/\/[^\s'"`<>()\[\]{},;]+/gi;
const EMAIL_PATTERN =
    /[^\s@'"`<>()\[\]{},;:\/\\]+@[^\s@'"`<>()\[\]{},;:\/\\]+/g;
const ORG_ID_PATTERN = /\b00D[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?\b/g;

/**
 * Masks every URL, username-shaped (email-like) and org-ID-shaped substring
 * of a free-form text such as an error message.
 */
export const scrubOrgIdentifiers = (text: string): string =>
    text
        .replace(URL_PATTERN, (match) => maskInstanceUrl(match))
        .replace(EMAIL_PATTERN, (match) => maskUsername(match))
        .replace(ORG_ID_PATTERN, (match) => maskOrgId(match));

/**
 * Returns a copy of an org authorization with username, orgId and
 * instanceUrl masked. Aliases, isDevHub and apiVersion are left untouched.
 */
export const maskOrgAuthorization = <T extends OrgAuthorization>(
    org: T,
): T => ({
    ...org,
    aliases: org.aliases ? [...org.aliases] : org.aliases,
    username: maskUsername(org.username),
    orgId: maskOrgId(org.orgId),
    instanceUrl: maskInstanceUrl(org.instanceUrl),
});

export interface ClientOrgReference {
    /** An alias, a masked username, or null when nothing is configured. */
    org: string | null;
    /** True when `org` is an alias that can be passed as targetOrg. */
    isAlias: boolean;
    /** Set when the org has no alias and the user should create one. */
    message?: string;
}

/**
 * Converts an org reference (alias or username, e.g. the CLI's target-org
 * config value) into something safe to show the AI client: an alias whenever
 * one exists, otherwise a masked username plus a hint to set an alias.
 * - value matches an alias                     -> that alias
 * - value is a username with aliases           -> its first alias
 * - value is a username without an alias       -> masked username + message
 * - value is unknown and looks like a username -> masked username + message
 * - value is unknown and has no "@"            -> returned as-is (an alias)
 * Pass `orgs = null` when the org list could not be read: a username is then
 * masked with a message saying its alias couldn't be looked up, rather than
 * claiming it has none.
 */
export const toClientOrgReference = (
    value: string | null | undefined,
    orgs: OrgAuthorization[] | null,
): ClientOrgReference => {
    if (!value) return { org: null, isAlias: false };

    const list = orgs ?? [];
    const byAlias = list.find((org) => org.aliases?.includes(value));
    if (byAlias) return { org: value, isAlias: true };

    const lower = value.toLowerCase();
    const byUsername = list.find(
        (org) => org.username?.toLowerCase() === lower,
    );
    const firstAlias = byUsername?.aliases?.find((alias) => !!alias);
    if (firstAlias) return { org: firstAlias, isAlias: true };

    if (byUsername || value.includes("@")) {
        const masked = maskUsername(value);
        return {
            org: masked,
            isAlias: false,
            message:
                orgs === null
                    ? `The org '${masked}' is referenced by username, and the list of authenticated orgs couldn't be read to find its alias. Retry, or ask the user for the org's alias (they can list them with: sf alias list).`
                    : `The org '${masked}' has no alias, so it can't be referenced by the assistant. Ask the user to set one with: sf alias set <alias>=<username>`,
        };
    }

    return { org: value, isAlias: true };
};

const USERNAME_KEYS = new Set(["username"]);
const ORG_ID_KEYS = new Set(["orgId", "organizationId"]);
const URL_KEYS = new Set(["instanceUrl", "loginUrl"]);

/**
 * Returns a deep copy of a CLI JSON result with org identifier fields masked:
 * `username`, `orgId`/`organizationId`, `instanceUrl`/`loginUrl`, and any
 * identifiers inside `message` strings. Other fields are copied unchanged.
 * Used for org-management results (login, open) whose identifiers the AI
 * never supplied.
 */
export const maskOrgIdentifierFields = (value: unknown): any => {
    if (Array.isArray(value)) return value.map(maskOrgIdentifierFields);
    if (!value || typeof value !== "object") return value;

    const out: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(value)) {
        if (typeof field === "string" && USERNAME_KEYS.has(key)) {
            out[key] = maskUsername(field);
        } else if (typeof field === "string" && ORG_ID_KEYS.has(key)) {
            out[key] = maskOrgId(field);
        } else if (typeof field === "string" && URL_KEYS.has(key)) {
            out[key] = maskInstanceUrl(field);
        } else if (typeof field === "string" && key === "message") {
            out[key] = scrubOrgIdentifiers(field);
        } else {
            out[key] = maskOrgIdentifierFields(field);
        }
    }
    return out;
};
