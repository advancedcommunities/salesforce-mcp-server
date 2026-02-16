import { AuthInfo, Connection } from "@salesforce/core";
import { logger } from "../utils/logger.js";

/**
 * Authorization information for a Salesforce org
 */
export interface OrgAuthorization {
    username: string;
    aliases?: string[] | null;
    orgId?: string;
    instanceUrl?: string;
    isDevHub?: boolean;
    apiVersion?: string;
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
                (auth.aliases && auth.aliases.includes(targetOrg)),
        );

        if (!foundOrg) {
            throw new Error(
                `No authenticated org found for '${targetOrg}'. ` +
                    `Please run 'sf org login' or 'sf org create' first.`,
            );
        }

        const authInfo = await AuthInfo.create({ username: foundOrg.username });
        const connection = await Connection.create({ authInfo });
        return connection;
    } catch (error: any) {
        if (error.name === "NoAuthInfoFound") {
            logger.critical(
                "salesforce",
                `No auth info found for org '${targetOrg}'`,
            );
            throw new Error(
                'No authenticated orgs found. Please run "sf org login" to authenticate.',
            );
        }
        logger.error(
            "salesforce",
            `Failed to connect to org '${targetOrg}': ${error.message}`,
        );
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

        return await Promise.all(
            allAuthorizations.map(async (auth) => {
                try {
                    const authInfo = await AuthInfo.create({
                        username: auth.username,
                    });
                    const connection = await Connection.create({ authInfo });

                    return {
                        username: auth.username,
                        aliases: auth.aliases || undefined,
                        orgId: auth.orgId,
                        instanceUrl: auth.instanceUrl,
                        isDevHub: auth.isDevHub,
                        apiVersion: connection.version,
                    };
                } catch {
                    return {
                        username: auth.username,
                        aliases: auth.aliases || undefined,
                        orgId: auth.orgId,
                        instanceUrl: auth.instanceUrl,
                        isDevHub: auth.isDevHub,
                    };
                }
            }),
        );
    } catch (error: any) {
        if (error.name === "NoAuthInfoFound") {
            logger.critical(
                "salesforce",
                "No auth info found when listing orgs",
            );
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
                (org.aliases && org.aliases.includes(targetOrg)),
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
    targetOrg: string,
): Promise<OrgAuthorization | null> {
    try {
        const allOrgs = await listAllOrgs();
        return (
            allOrgs.find(
                (org) =>
                    org.username === targetOrg ||
                    (org.aliases && org.aliases.includes(targetOrg)),
            ) || null
        );
    } catch {
        return null;
    }
}

/**
 * Get the access token for a Salesforce org
 * @param targetOrg - The username or alias of the org
 * @returns The access token string
 * @throws Error if org is not authenticated
 */
export async function getOrgAccessToken(targetOrg: string): Promise<string> {
    try {
        const allAuthorizations = await AuthInfo.listAllAuthorizations();

        const foundOrg = allAuthorizations.find(
            (auth) =>
                auth.username === targetOrg ||
                (auth.aliases && auth.aliases.includes(targetOrg)),
        );

        if (!foundOrg) {
            throw new Error(
                `No authenticated org found for '${targetOrg}'. ` +
                    `Please run 'sf org login' or 'sf org create' first.`,
            );
        }

        const authInfo = await AuthInfo.create({ username: foundOrg.username });
        const connection = await Connection.create({ authInfo });

        return connection.accessToken || "";
    } catch (error: any) {
        if (error.name === "NoAuthInfoFound") {
            throw new Error(
                'No authenticated orgs found. Please run "sf org login" to authenticate.',
            );
        }
        throw error;
    }
}
