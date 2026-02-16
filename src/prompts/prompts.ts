import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { permissions } from "../config/permissions.js";
import { resolveTargetOrg } from "../utils/resolveTargetOrg.js";
import { executeSfCommand } from "../utils/sfCommand.js";
import { executeSObjectDescribe } from "../tools/sobjects.js";
import { getOrgInfo } from "../shared/connection.js";

/**
 * Resolve and validate org access for prompts.
 * Returns the resolved org alias or throws an error.
 */
async function resolveAndValidateOrg(targetOrg?: string): Promise<string> {
    const org = await resolveTargetOrg(targetOrg);
    if (!permissions.isOrgAllowed(org)) {
        throw new Error(
            `Access denied: Org '${org}' is not in the allowed list`,
        );
    }
    return org;
}

/**
 * Return a standard error prompt result.
 */
function errorPromptResult(message: string) {
    return {
        messages: [
            {
                role: "assistant" as const,
                content: {
                    type: "text" as const,
                    text: `Error: ${message}`,
                },
            },
        ],
    };
}

export function registerPrompts(server: McpServer) {
    // ── 1. soql_builder ──────────────────────────────────────────────
    server.registerPrompt(
        "soql_builder",
        {
            title: "SOQL Query Builder",
            description:
                "Describe an SObject and help build a SOQL query step by step",
            argsSchema: {
                objectName: z
                    .string()
                    .describe("API name of the SObject to query"),
                targetOrg: z
                    .string()
                    .optional()
                    .describe(
                        "Target Salesforce org alias. Uses default org if not provided.",
                    ),
            },
        },
        async (args) => {
            try {
                const org = await resolveAndValidateOrg(args.targetOrg);
                const result = await executeSObjectDescribe(
                    org,
                    args.objectName,
                );
                const describe = result.result as any;

                const fields = (describe.fields || []).map((f: any) => ({
                    name: f.name,
                    type: f.type,
                    label: f.label,
                    nillable: f.nillable,
                    referenceTo: f.referenceTo || [],
                    relationshipName: f.relationshipName ?? null,
                }));

                const relationships = fields.filter(
                    (f: any) => f.referenceTo.length > 0,
                );

                const childRelationships = (describe.childRelationships || [])
                    .filter((r: any) => r.relationshipName)
                    .map((r: any) => ({
                        childSObject: r.childSObject,
                        relationshipName: r.relationshipName,
                        field: r.field,
                    }));

                const fieldList = fields
                    .map(
                        (f: any) =>
                            `- ${f.name} (${f.type}${f.nillable ? ", nullable" : ""})`,
                    )
                    .join("\n");

                const relationshipList =
                    relationships.length > 0
                        ? relationships
                              .map(
                                  (f: any) =>
                                      `- ${f.name} → ${f.referenceTo.join(", ")} (relationship: ${f.relationshipName || "none"})`,
                              )
                              .join("\n")
                        : "None";

                const childList =
                    childRelationships.length > 0
                        ? childRelationships
                              .map(
                                  (r: any) =>
                                      `- ${r.relationshipName} → ${r.childSObject}.${r.field}`,
                              )
                              .join("\n")
                        : "None";

                return {
                    messages: [
                        {
                            role: "user" as const,
                            content: {
                                type: "text" as const,
                                text: `Help me build a SOQL query for the **${args.objectName}** object in org **${org}**.

Here is the object schema:

**Fields (${fields.length}):**
${fieldList}

**Lookup/Master-Detail Relationships:**
${relationshipList}

**Child Relationships (subqueries):**
${childList}

Please help me construct a SOQL query. Ask me:
1. Which fields do I need?
2. What filter conditions (WHERE clause)?
3. Do I need any related object fields (parent or child relationships)?
4. Ordering and limit preferences?

Then build the final SOQL query for me.`,
                            },
                        },
                    ],
                };
            } catch (error: any) {
                return errorPromptResult(error.message);
            }
        },
    );

    // ── 2. apex_review ───────────────────────────────────────────────
    server.registerPrompt(
        "apex_review",
        {
            title: "Apex Code Review",
            description:
                "Fetch an Apex class from the org and perform a structured code review",
            argsSchema: {
                className: z
                    .string()
                    .describe("Name of the Apex class to review"),
                targetOrg: z
                    .string()
                    .optional()
                    .describe(
                        "Target Salesforce org alias. Uses default org if not provided.",
                    ),
            },
        },
        async (args) => {
            try {
                const org = await resolveAndValidateOrg(args.targetOrg);
                const queryResult = await executeSfCommand(
                    `sf data query --query "SELECT Name, Body, LengthWithoutComments, ApiVersion FROM ApexClass WHERE Name = '${args.className}'" --target-org ${org} --json`,
                );

                const records = queryResult?.result?.records || [];
                if (records.length === 0) {
                    return errorPromptResult(
                        `Apex class '${args.className}' not found in org '${org}'.`,
                    );
                }

                const cls = records[0];

                return {
                    messages: [
                        {
                            role: "user" as const,
                            content: {
                                type: "text" as const,
                                text: `Please perform a code review of this Apex class from org **${org}**.

**Class:** ${cls.Name}
**API Version:** ${cls.ApiVersion}
**Length (without comments):** ${cls.LengthWithoutComments} characters

\`\`\`apex
${cls.Body}
\`\`\`

Review the code against this checklist:

1. **Best Practices** — Proper use of access modifiers, naming conventions, separation of concerns
2. **Security** — CRUD/FLS checks, SOQL injection prevention, sharing rules (with/without sharing)
3. **Governor Limits** — No SOQL/DML inside loops, proper use of collections and maps
4. **Bulkification** — Handles bulk operations (trigger context with 200+ records)
5. **Error Handling** — Try/catch blocks, meaningful error messages, proper exception types
6. **Test Coverage** — Are there obvious gaps that would make testing difficult?
7. **Performance** — Unnecessary queries, inefficient loops, large data volume considerations

Provide specific findings with line references and suggested improvements.`,
                            },
                        },
                    ],
                };
            } catch (error: any) {
                return errorPromptResult(error.message);
            }
        },
    );

    // ── 3. org_health_check ──────────────────────────────────────────
    server.registerPrompt(
        "org_health_check",
        {
            title: "Org Health Check",
            description:
                "Fetch org info, API limits, and test coverage to assess org health",
            argsSchema: {
                targetOrg: z
                    .string()
                    .optional()
                    .describe(
                        "Target Salesforce org alias. Uses default org if not provided.",
                    ),
            },
        },
        async (args) => {
            try {
                const org = await resolveAndValidateOrg(args.targetOrg);

                const [orgInfo, limitsResult, coverageResult] =
                    await Promise.all([
                        getOrgInfo(org),
                        executeSfCommand(
                            `sf limits api display --target-org ${org} --json`,
                        ),
                        executeSfCommand(
                            `sf data query --query "SELECT PercentCovered FROM ApexOrgWideCoverage" --target-org ${org} --json`,
                        ).catch(() => null),
                    ]);

                const limits = (limitsResult?.result || []).map((l: any) => ({
                    name: l.name,
                    max: l.max,
                    remaining: l.remaining,
                }));

                const criticalLimits = limits.filter(
                    (l: any) =>
                        l.max > 0 && (l.max - l.remaining) / l.max > 0.7,
                );

                const coverageRecords = coverageResult?.result?.records || [];
                const coveragePct =
                    coverageRecords.length > 0
                        ? coverageRecords[0].PercentCovered
                        : "unknown";

                const orgInfoText = orgInfo
                    ? `- **Username:** ${orgInfo.username}\n- **Org ID:** ${orgInfo.orgId || "N/A"}\n- **Instance URL:** ${orgInfo.instanceUrl || "N/A"}\n- **API Version:** ${orgInfo.apiVersion || "N/A"}\n- **Is Dev Hub:** ${orgInfo.isDevHub ?? "N/A"}`
                    : "Org info unavailable";

                const criticalLimitsText =
                    criticalLimits.length > 0
                        ? criticalLimits
                              .map(
                                  (l: any) =>
                                      `- **${l.name}:** ${l.max - l.remaining} / ${l.max} used (${l.remaining} remaining)`,
                              )
                              .join("\n")
                        : "All limits are within safe thresholds (< 70% usage)";

                return {
                    messages: [
                        {
                            role: "user" as const,
                            content: {
                                type: "text" as const,
                                text: `Analyze the health of Salesforce org **${org}**.

**Org Information:**
${orgInfoText}

**Apex Code Coverage:** ${coveragePct}%

**Limits Approaching Threshold (> 70% used):**
${criticalLimitsText}

**All Limits (${limits.length} total):**
${limits.map((l: any) => `- ${l.name}: ${l.max - l.remaining}/${l.max} used`).join("\n")}

Please analyze this data and provide:
1. **Overall health assessment** (healthy / warning / critical)
2. **Code coverage status** — is it above the 75% deployment threshold?
3. **Limits at risk** — any limits that need attention?
4. **Recommendations** — actionable steps to improve org health`,
                            },
                        },
                    ],
                };
            } catch (error: any) {
                return errorPromptResult(error.message);
            }
        },
    );

    // ── 4. deploy_checklist ──────────────────────────────────────────
    server.registerPrompt(
        "deploy_checklist",
        {
            title: "Pre-Deployment Checklist",
            description:
                "Fetch org limits and coverage to generate a pre-deployment readiness checklist",
            argsSchema: {
                targetOrg: z
                    .string()
                    .optional()
                    .describe(
                        "Target Salesforce org alias. Uses default org if not provided.",
                    ),
            },
        },
        async (args) => {
            try {
                const org = await resolveAndValidateOrg(args.targetOrg);

                const [limitsResult, coverageResult] = await Promise.all([
                    executeSfCommand(
                        `sf limits api display --target-org ${org} --json`,
                    ),
                    executeSfCommand(
                        `sf data query --query "SELECT PercentCovered FROM ApexOrgWideCoverage" --target-org ${org} --json`,
                    ).catch(() => null),
                ]);

                const limits = (limitsResult?.result || []).map((l: any) => ({
                    name: l.name,
                    max: l.max,
                    remaining: l.remaining,
                }));

                const coverageRecords = coverageResult?.result?.records || [];
                const coveragePct =
                    coverageRecords.length > 0
                        ? coverageRecords[0].PercentCovered
                        : null;

                const coverageStatus =
                    coveragePct !== null
                        ? coveragePct >= 75
                            ? `${coveragePct}% — PASS (>= 75%)`
                            : `${coveragePct}% — FAIL (< 75% required)`
                        : "Unknown — could not retrieve coverage data";

                const apiLimit = limits.find(
                    (l: any) => l.name === "DailyApiRequests",
                );
                const apiLimitText = apiLimit
                    ? `${apiLimit.remaining} / ${apiLimit.max} remaining`
                    : "Unknown";

                return {
                    messages: [
                        {
                            role: "user" as const,
                            content: {
                                type: "text" as const,
                                text: `Generate a pre-deployment checklist for org **${org}**.

**Current Org Status:**
- Apex Code Coverage: ${coverageStatus}
- Daily API Requests: ${apiLimitText}

**Deployment Readiness Checklist:**

- [ ] **Code coverage >= 75%** — Current: ${coverageStatus}
- [ ] **All Apex tests passing** — Run tests to verify
- [ ] **No SOQL/DML inside loops** — Review code for governor limit violations
- [ ] **CRUD/FLS checks in place** — Verify field-level security enforcement
- [ ] **No hardcoded IDs** — Ensure all IDs are dynamically resolved
- [ ] **Sharing rules respected** — Classes use appropriate sharing declarations
- [ ] **API limits sufficient** — Daily API Requests: ${apiLimitText}
- [ ] **Rollback plan documented** — Have a plan to revert if deployment fails
- [ ] **Change set / package validated** — Run validation-only deployment first
- [ ] **Stakeholders notified** — Inform team about the deployment window

Please review this checklist against the org data and help me:
1. Identify any items that are **not ready** for deployment
2. Suggest specific actions to resolve any blockers
3. Recommend a deployment strategy (validate first, deploy during off-hours, etc.)`,
                            },
                        },
                    ],
                };
            } catch (error: any) {
                return errorPromptResult(error.message);
            }
        },
    );

    // ── 5. debug_apex ────────────────────────────────────────────────
    server.registerPrompt(
        "debug_apex",
        {
            title: "Debug Apex Log",
            description:
                "Fetch an Apex debug log (by ID or most recent) and analyze it for errors and performance issues",
            argsSchema: {
                targetOrg: z
                    .string()
                    .optional()
                    .describe(
                        "Target Salesforce org alias. Uses default org if not provided.",
                    ),
                logId: z
                    .string()
                    .optional()
                    .describe(
                        "ID of a specific Apex debug log. If not provided, fetches the most recent log.",
                    ),
            },
        },
        async (args) => {
            try {
                const org = await resolveAndValidateOrg(args.targetOrg);
                let logContent: string;
                let logId = args.logId;

                if (logId) {
                    const logResult = await executeSfCommand(
                        `sf apex get log --log-id ${logId} --target-org ${org} --json`,
                    );
                    logContent =
                        logResult?.result?.[0]?.log ||
                        logResult?.result?.log ||
                        JSON.stringify(logResult?.result);
                } else {
                    const listResult = await executeSfCommand(
                        `sf apex log list --target-org ${org} --json`,
                    );
                    const logs = listResult?.result || [];
                    if (logs.length === 0) {
                        return errorPromptResult(
                            `No debug logs found in org '${org}'. Generate logs by running Apex code or enabling debug logging.`,
                        );
                    }
                    logId = logs[0].Id;
                    const logResult = await executeSfCommand(
                        `sf apex get log --log-id ${logId} --target-org ${org} --json`,
                    );
                    logContent =
                        logResult?.result?.[0]?.log ||
                        logResult?.result?.log ||
                        JSON.stringify(logResult?.result);
                }

                const truncatedLog =
                    logContent.length > 50000
                        ? logContent.substring(0, 50000) +
                          "\n\n... [LOG TRUNCATED — original length: " +
                          logContent.length +
                          " characters]"
                        : logContent;

                return {
                    messages: [
                        {
                            role: "user" as const,
                            content: {
                                type: "text" as const,
                                text: `Analyze this Apex debug log from org **${org}** (Log ID: ${logId}).

\`\`\`
${truncatedLog}
\`\`\`

Please analyze the log and identify:
1. **Errors and exceptions** — Any unhandled exceptions, SOQL errors, or DML failures
2. **Governor limit usage** — SOQL queries, DML statements, CPU time, heap size
3. **Performance issues** — Slow queries, excessive loop iterations, redundant operations
4. **Flow of execution** — Summarize what the code was doing when the issue occurred
5. **Recommendations** — Specific fixes or optimizations to address the issues found`,
                            },
                        },
                    ],
                };
            } catch (error: any) {
                return errorPromptResult(error.message);
            }
        },
    );
}
