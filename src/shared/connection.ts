import { AuthInfo, Connection } from "@salesforce/core";

/**
 * Authorization information for a Salesforce org
 */
export interface OrgAuthorization {
    username: string;
    aliases?: string[] | null;
    orgId?: string;
    instanceUrl?: string;
    isDevHub?: boolean;
}

/**
 * Get a connection to a Salesforce org using existing CLI authentication
 * @param targetOrg - The username or alias of the org
 * @returns A Connection instance
 */
export async function getConnection(targetOrg: string): Promise<Connection> {
    try {
        const allAuthorizations = await AuthInfo.listAllAuthorizations();

        const foundOrg = allAuthorizations.find(
            (auth) =>
                auth.username === targetOrg ||
                (auth.aliases && auth.aliases.includes(targetOrg))
        );

        if (!foundOrg) {
            throw new Error(
                `No authenticated org found for '${targetOrg}'. ` +
                    `Please run 'sf org login' or 'sf org create' first.`
            );
        }

        const authInfo = await AuthInfo.create({ username: foundOrg.username });
        const connection = await Connection.create({ authInfo });
        return connection;
    } catch (error: any) {
        if (error.name === "NoAuthInfoFound") {
            throw new Error(
                'No authenticated orgs found. Please run "sf org login" to authenticate.'
            );
        }
        throw error;
    }
}

/**
 * List all authenticated Salesforce orgs from the CLI
 * @returns Array of org authorization information
 */
export async function listAllOrgs(): Promise<OrgAuthorization[]> {
    try {
        const allAuthorizations = await AuthInfo.listAllAuthorizations();

        return allAuthorizations.map((auth) => ({
            username: auth.username,
            aliases: auth.aliases || undefined,
            orgId: auth.orgId,
            instanceUrl: auth.instanceUrl,
            isDevHub: auth.isDevHub,
        }));
    } catch (error: any) {
        if (error.name === "NoAuthInfoFound") {
            return [];
        }
        throw error;
    }
}

/**
 * Check if an org is authenticated
 * @param targetOrg - The username or alias to check
 * @returns true if the org is authenticated, false otherwise
 */
export async function isOrgAuthenticated(targetOrg: string): Promise<boolean> {
    try {
        const allOrgs = await listAllOrgs();
        return allOrgs.some(
            (org) =>
                org.username === targetOrg ||
                (org.aliases && org.aliases.includes(targetOrg))
        );
    } catch {
        return false;
    }
}

/**
 * Get org information by username or alias
 * @param targetOrg - The username or alias of the org
 * @returns Org authorization information or null if not found
 */
export async function getOrgInfo(
    targetOrg: string
): Promise<OrgAuthorization | null> {
    try {
        const allOrgs = await listAllOrgs();
        return (
            allOrgs.find(
                (org) =>
                    org.username === targetOrg ||
                    (org.aliases && org.aliases.includes(targetOrg))
            ) || null
        );
    } catch {
        return null;
    }
}
