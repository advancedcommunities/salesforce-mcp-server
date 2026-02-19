import {
    McpServer,
    ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { permissions } from "../config/permissions.js";
import { getDefaultOrg } from "../utils/resolveTargetOrg.js";
import { listAllOrgs, getOrgInfo } from "../shared/connection.js";
import { executeSfCommand } from "../utils/sfCommand.js";
import {
    executeSobjectList,
    executeSObjectDescribe,
} from "../tools/sobjects.js";

/**
 * List orgs that the server is permitted to access.
 */
export async function getAccessibleOrgs() {
    const orgs = await listAllOrgs();
    const allowedOrgs = permissions.getAllowedOrgs();

    if (allowedOrgs === "ALL") return orgs;

    return orgs.filter((org) => {
        if (permissions.isOrgAllowed(org.username)) return true;
        if (org.aliases) {
            return org.aliases.some((alias) => permissions.isOrgAllowed(alias));
        }
        return false;
    });
}

/**
 * Autocomplete helper for the {alias} URI variable.
 */
export async function completeAlias(value: string): Promise<string[]> {
    const orgs = await getAccessibleOrgs();
    const identifiers = orgs.map((org) => org.aliases?.[0] ?? org.username);
    return identifiers.filter((id) =>
        id.toLowerCase().startsWith(value.toLowerCase()),
    );
}

/**
 * Validate org access for template resources. Returns the resolved alias
 * or throws a structured error response.
 */
function validateOrgAccess(alias: string): string {
    if (!permissions.isOrgAllowed(alias)) {
        throw new Error(
            `Access denied: Org '${alias}' is not in the allowed list`,
        );
    }
    return alias;
}

export function registerResources(server: McpServer) {
    // ── 1. server_permissions (static) ─────────────────────────────
    server.registerResource(
        "server_permissions",
        "salesforce://permissions",
        {
            description:
                "Current server permission settings including read-only mode, allowed orgs, and default org",
            mimeType: "application/json",
        },
        async () => {
            const defaultOrg = await getDefaultOrg();
            return {
                contents: [
                    {
                        uri: "salesforce://permissions",
                        mimeType: "application/json",
                        text: JSON.stringify({
                            readOnly: permissions.isReadOnly(),
                            allowedOrgs: permissions.getAllowedOrgs(),
                            defaultOrg,
                        }),
                    },
                ],
            };
        },
    );

    // ── 2. org_metadata (template) ─────────────────────────────────
    server.registerResource(
        "org_metadata",
        new ResourceTemplate("salesforce://org/{alias}/metadata", {
            list: undefined,
            complete: {
                alias: completeAlias,
            },
        }),
        {
            description:
                "Org metadata summary including org ID, username, instance URL, API version, and available metadata types",
            mimeType: "application/json",
        },
        async (_uri, { alias }) => {
            try {
                const orgAlias = validateOrgAccess(alias as string);
                const orgInfo = await getOrgInfo(orgAlias);
                const metadataResult = await executeSfCommand(
                    `sf org list metadata-types --target-org ${orgAlias} --json`,
                );

                const metadataTypes = (
                    metadataResult?.result?.metadataObjects || []
                ).map((mt: any) => ({
                    xmlName: mt.xmlName,
                    suffix: mt.suffix ?? null,
                    directoryName: mt.directoryName ?? null,
                    inFolder: mt.inFolder ?? false,
                }));

                return {
                    contents: [
                        {
                            uri: `salesforce://org/${orgAlias}/metadata`,
                            mimeType: "application/json",
                            text: JSON.stringify({
                                orgId: orgInfo?.orgId ?? null,
                                username: orgInfo?.username ?? null,
                                instanceUrl: orgInfo?.instanceUrl ?? null,
                                apiVersion: orgInfo?.apiVersion ?? null,
                                metadataTypes,
                            }),
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    contents: [
                        {
                            uri: `salesforce://org/${alias}/metadata`,
                            mimeType: "application/json",
                            text: JSON.stringify({ error: error.message }),
                        },
                    ],
                };
            }
        },
    );

    // ── 3. org_objects (template) ──────────────────────────────────
    server.registerResource(
        "org_objects",
        new ResourceTemplate("salesforce://org/{alias}/objects", {
            list: undefined,
            complete: {
                alias: completeAlias,
            },
        }),
        {
            description:
                "List of all standard and custom SObjects available in the org",
            mimeType: "application/json",
        },
        async (_uri, { alias }) => {
            try {
                const orgAlias = validateOrgAccess(alias as string);
                const result = await executeSobjectList(orgAlias);

                return {
                    contents: [
                        {
                            uri: `salesforce://org/${orgAlias}/objects`,
                            mimeType: "application/json",
                            text: JSON.stringify({
                                targetOrg: orgAlias,
                                sobjects: result.result as string[],
                            }),
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    contents: [
                        {
                            uri: `salesforce://org/${alias}/objects`,
                            mimeType: "application/json",
                            text: JSON.stringify({ error: error.message }),
                        },
                    ],
                };
            }
        },
    );

    // ── 4. org_object_schema (template, list: undefined) ──────────
    server.registerResource(
        "org_object_schema",
        new ResourceTemplate("salesforce://org/{alias}/object/{name}", {
            list: undefined,
            complete: {
                alias: completeAlias,
                name: async (value: string, context) => {
                    const orgAlias = context?.arguments?.alias;
                    if (!orgAlias) return [];
                    try {
                        const result = await executeSobjectList(orgAlias);
                        const objects = result.result as string[];
                        return objects.filter((obj) =>
                            obj.toLowerCase().startsWith(value.toLowerCase()),
                        );
                    } catch {
                        return [];
                    }
                },
            },
        }),
        {
            description:
                "Detailed schema for a specific SObject including fields, relationships, and record types",
            mimeType: "application/json",
        },
        async (_uri, { alias, name }) => {
            try {
                const orgAlias = validateOrgAccess(alias as string);
                const objectName = name as string;
                const result = await executeSObjectDescribe(
                    orgAlias,
                    objectName,
                );
                const describe = result.result as any;

                return {
                    contents: [
                        {
                            uri: `salesforce://org/${orgAlias}/object/${objectName}`,
                            mimeType: "application/json",
                            text: JSON.stringify({
                                targetOrg: orgAlias,
                                name: describe.name,
                                label: describe.label,
                                keyPrefix: describe.keyPrefix ?? null,
                                custom: describe.custom,
                                queryable: describe.queryable,
                                fields: (describe.fields || []).map(
                                    (f: any) => ({
                                        name: f.name,
                                        label: f.label,
                                        type: f.type,
                                        length: f.length,
                                        nillable: f.nillable,
                                        custom: f.custom,
                                        updateable: f.updateable,
                                        createable: f.createable,
                                        referenceTo: f.referenceTo || [],
                                        relationshipName:
                                            f.relationshipName ?? null,
                                    }),
                                ),
                                childRelationships: (
                                    describe.childRelationships || []
                                ).map((r: any) => ({
                                    childSObject: r.childSObject,
                                    field: r.field,
                                    relationshipName:
                                        r.relationshipName ?? null,
                                })),
                                recordTypeInfos: (
                                    describe.recordTypeInfos || []
                                ).map((rt: any) => ({
                                    name: rt.name,
                                    recordTypeId: rt.recordTypeId,
                                    active: rt.active,
                                    available: rt.available,
                                    defaultRecordTypeMapping:
                                        rt.defaultRecordTypeMapping,
                                    developerName: rt.developerName,
                                })),
                            }),
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    contents: [
                        {
                            uri: `salesforce://org/${alias}/object/${name}`,
                            mimeType: "application/json",
                            text: JSON.stringify({ error: error.message }),
                        },
                    ],
                };
            }
        },
    );

    // ── 5. org_limits (template) ──────────────────────────────────
    server.registerResource(
        "org_limits",
        new ResourceTemplate("salesforce://org/{alias}/limits", {
            list: undefined,
            complete: {
                alias: completeAlias,
            },
        }),
        {
            description:
                "API limits and usage for the org including daily API calls, storage, and other governor limits",
            mimeType: "application/json",
        },
        async (_uri, { alias }) => {
            try {
                const orgAlias = validateOrgAccess(alias as string);
                const result = await executeSfCommand(
                    `sf limits api display --target-org ${orgAlias} --json`,
                );

                const limits = (result?.result || []).map((l: any) => ({
                    name: l.name,
                    max: l.max,
                    remaining: l.remaining,
                }));

                return {
                    contents: [
                        {
                            uri: `salesforce://org/${orgAlias}/limits`,
                            mimeType: "application/json",
                            text: JSON.stringify({
                                targetOrg: orgAlias,
                                limits,
                            }),
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    contents: [
                        {
                            uri: `salesforce://org/${alias}/limits`,
                            mimeType: "application/json",
                            text: JSON.stringify({ error: error.message }),
                        },
                    ],
                };
            }
        },
    );
}
