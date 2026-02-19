import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import z from "zod";

const SKILL_CONTENT = `---
name: salesforce
description: "Use when working with Salesforce orgs — executing Apex, writing SOQL/SOSL, managing records, running tests, deploying metadata, or analyzing code. Guidance for the Salesforce MCP Server's tools, prompts, and resources."
---

# Salesforce MCP Server — Skill Guide

## Overview

The Salesforce MCP Server gives you **40 tools**, **5 prompts**, and **5 resources** to interact with Salesforce orgs through the Salesforce CLI. This skill teaches you how to choose the right tool, chain tools into workflows, and avoid common mistakes.

## Start Here: Establish Org Context

Before doing anything else, determine the target org and check permissions.

1. **Get the default org** — call \`get_default_org\`. If a default is set, you can omit \`targetOrg\` from all subsequent calls.
2. **List connected orgs** — call \`list_connected_salesforce_orgs\` if the user hasn't specified which org to use.
3. **Check permissions** — call \`get_server_permissions\` to see if the server is in read-only mode and which orgs are allowed.
4. **Set a default** — if the user picks an org, call \`set_default_org\` so future calls don't need \`targetOrg\`.

> **Rule**: Never guess the org. Always resolve it first.

## Tool Selection Guide

### Querying Data

| Need | Tool | Why |
|---|---|---|
| Structured query on a **single object** with field conditions | \`query_records\` | SOQL — precise field selection, WHERE clause, ORDER BY, LIMIT |
| **Text search** across **multiple objects** | \`search_records\` | SOSL — FIND {term} IN ALL FIELDS RETURNING Obj1, Obj2 |
| Export large result sets to CSV/JSON | \`query_records_to_file\` | Streams results to a file to avoid context window bloat |

- Use \`query_records\` for most data retrieval tasks (exact field filters, relationships, aggregations).
- Use \`search_records\` only when you need cross-object keyword search (e.g., "find all records mentioning Acme Corp").
- Never build SOSL when a simple SOQL WHERE clause suffices.

### Executing Code vs. CRUD Operations

| Need | Tool | Why |
|---|---|---|
| Complex business logic, loops, multiple DML ops | \`execute_anonymous_apex\` | Runs anonymous Apex in the org |
| Create a single record | \`create_record\` | REST API — simpler, no Apex needed |
| Update a single record | \`update_record\` | REST API — direct field updates |
| Delete a single record | \`delete_record\` | REST API — direct delete by ID |

- Prefer CRUD tools for simple record operations — they're faster and don't require read-write mode.
- Use \`execute_anonymous_apex\` when you need transaction control, multiple object operations, or complex logic.
- \`execute_anonymous_apex\` is blocked in read-only mode; CRUD tools are also blocked in read-only mode.

### Code Analysis

| Need | Tool | Why |
|---|---|---|
| Modern rule-based analysis (PMD, ESLint, regex) | \`run_code_analyzer\` | Newer, recommended tool |
| List available analysis rules | \`list_code_analyzer_rules\` | See what rules are available |
| Legacy multi-engine scan | \`scanner_run\` | Older tool, still functional |
| Data flow / path-based security analysis | \`scanner_run_dfa\` | Graph Engine — deep SOQL injection, CRUD/FLS analysis |

- Prefer \`run_code_analyzer\` over \`scanner_run\` for general-purpose analysis.
- Use \`scanner_run_dfa\` only when you need deep data-flow security analysis (it's slow).

### Generating Code

| Need | Tool |
|---|---|
| Apex class files | \`generate_class\` |
| Apex trigger files | \`generate_trigger\` |
| Lightning Web Component or Aura component | \`generate_component\` |
| Custom tab for an object | \`schema_generate_tab\` |

> **Important**: All \`generate_*\` tools write files **locally**. They do NOT push to the org. Use \`deploy_start\` afterward to deploy the generated metadata.

### Org & User Management

| Need | Tool |
|---|---|
| List all connected orgs | \`list_connected_salesforce_orgs\` |
| Get current default org | \`get_default_org\` |
| Set default org | \`set_default_org\` |
| Clear default org | \`clear_default_org\` |
| Login to a new org | \`login_into_org\` |
| Log out of an org | \`logout\` |
| Open org in browser | \`open\` |
| Get user details | \`display_user\` |
| Assign permission set | \`assign_permission_set\` |
| Assign permission set license | \`assign_permission_set_license\` |

### Metadata & Packages

| Need | Tool |
|---|---|
| List metadata components of a type | \`list_metadata\` |
| List all metadata type names | \`list_metadata_types\` |
| Deploy metadata to org | \`deploy_start\` |
| Install a package | \`package_install\` |
| Uninstall a package | \`package_uninstall\` |

### Testing & Debugging

| Need | Tool |
|---|---|
| Run Apex tests | \`run_apex_tests\` |
| Get async test results | \`get_apex_test_results\` |
| Get code coverage info | \`get_apex_code_coverage\` |
| List debug logs | \`apex_log_list\` |
| Fetch a specific debug log | \`apex_get_log\` |

### Records

| Need | Tool |
|---|---|
| Open a record in the browser | \`open_record\` |
| Create a new record | \`create_record\` |
| Update an existing record | \`update_record\` |
| Delete a record | \`delete_record\` |

## Tool Reference

All 40 tools grouped by category:

**Apex (7)**: \`execute_anonymous_apex\`, \`run_apex_tests\`, \`get_apex_test_results\`, \`get_apex_code_coverage\`, \`generate_class\`, \`generate_trigger\`, \`apex_log_list\`, \`apex_get_log\`

**Query (2)**: \`query_records\` (SOQL), \`query_records_to_file\` (SOQL to file)

**Search (1)**: \`search_records\` (SOSL)

**SObject (2)**: \`sobject_list\`, \`sobject_describe\`

**Org Management (7)**: \`list_connected_salesforce_orgs\`, \`get_default_org\`, \`set_default_org\`, \`clear_default_org\`, \`login_into_org\`, \`logout\`, \`open\`

**Records (4)**: \`open_record\`, \`create_record\`, \`update_record\`, \`delete_record\`

**Admin (4)**: \`get_server_permissions\`, \`assign_permission_set\`, \`assign_permission_set_license\`, \`display_user\`

**Metadata (3)**: \`list_metadata\`, \`list_metadata_types\`, \`deploy_start\`

**Code Analysis (4)**: \`run_code_analyzer\`, \`list_code_analyzer_rules\`, \`scanner_run\`, \`scanner_run_dfa\`

**Packages (2)**: \`package_install\`, \`package_uninstall\`

**Schema (1)**: \`schema_generate_tab\`

**Lightning (1)**: \`generate_component\`

**Skill (1)**: \`install_skill\`

## Workflow Patterns

### 1. Explore an Org

\`\`\`
get_default_org → list_connected_salesforce_orgs → sobject_list → sobject_describe
\`\`\`

Start by confirming the target org, list custom objects, then describe the ones the user is interested in to see fields and relationships.

### 2. Query Data

\`\`\`
sobject_describe → query_records (or search_records for text search)
\`\`\`

Always describe the object first to get correct field API names, then build the SOQL query. For large exports, use \`query_records_to_file\`.

### 3. Write & Run Apex

\`\`\`
execute_anonymous_apex → apex_log_list → apex_get_log
\`\`\`

Execute Apex, then fetch debug logs to inspect the execution output and diagnose issues.

### 4. Test & Deploy

\`\`\`
run_apex_tests → get_apex_test_results → get_apex_code_coverage → deploy_start
\`\`\`

Run tests first, verify coverage is >= 75%, then deploy. Use \`deploy_start\` with \`dryRun: true\` to validate before the real deployment.

### 5. Debug Issues

\`\`\`
apex_log_list → apex_get_log → execute_anonymous_apex (to test fixes)
\`\`\`

List recent logs, fetch the problematic one, analyze it, then use anonymous Apex to test potential fixes.

### 6. Generate & Deploy Code

\`\`\`
generate_class / generate_trigger / generate_component → deploy_start
\`\`\`

Generate the files locally, then deploy to the target org.

## Prompts

Use prompts for guided multi-step workflows. They fetch live org data and provide structured instructions.

| Prompt | When to Use |
|---|---|
| \`soql_builder\` | User needs help constructing a SOQL query — fetches object schema and guides field selection |
| \`apex_review\` | User wants a code review of an Apex class — fetches the class body and applies a review checklist |
| \`org_health_check\` | User wants to assess org health — fetches limits, coverage, and org info |
| \`deploy_checklist\` | User is preparing for a deployment — generates a readiness checklist with live data |
| \`debug_apex\` | User is debugging — fetches and analyzes a debug log for errors and performance |

## Resources

Resources provide browsable contextual data. Use them to include org information in your context.

| Resource | URI | When to Use |
|---|---|---|
| Server Permissions | \`salesforce://permissions\` | Check read-only mode, allowed orgs, default org |
| Org Metadata | \`salesforce://org/{alias}/metadata\` | Get org summary and available metadata types |
| Org Objects | \`salesforce://org/{alias}/objects\` | List all SObjects in the org |
| Object Schema | \`salesforce://org/{alias}/object/{name}\` | Get detailed field/relationship info for an SObject |
| Org Limits | \`salesforce://org/{alias}/limits\` | Check API limits and usage |

## Critical Pitfalls

1. **Don't guess the org** — Always resolve the target org with \`get_default_org\` or ask the user. Calling tools against the wrong org can cause data loss.

2. **Don't use SOSL when SOQL suffices** — \`search_records\` (SOSL) is for cross-object text search. For structured single-object queries, always use \`query_records\` (SOQL).

3. **Don't skip \`sobject_describe\` before querying** — Field API names are case-sensitive and often differ from labels. Describe the object first to get correct API names.

4. **Don't forget \`deploy_start\` after generating code** — \`generate_class\`, \`generate_trigger\`, and \`generate_component\` only write files locally. You must deploy to push them to the org.

5. **Respect read-only mode** — When the server is in read-only mode, Apex execution, record CRUD, and other write operations are blocked. Check \`get_server_permissions\` first.

6. **Don't put large result sets in context** — For queries returning many records, use \`query_records_to_file\` to write to a file instead of dumping everything into the conversation.

7. **Validate before deploying** — Always use \`deploy_start\` with \`dryRun: true\` first, especially for production orgs.

8. **Don't run DFA unnecessarily** — \`scanner_run_dfa\` is slow and resource-intensive. Use \`run_code_analyzer\` for general analysis and reserve DFA for deep security audits.

9. **Check test coverage before deploying** — Salesforce requires >= 75% code coverage for production deployments. Use \`get_apex_code_coverage\` to verify.

10. **Don't pass \`targetOrg\` when a default is set** — If \`get_default_org\` returns a value, omit \`targetOrg\` from subsequent calls to keep things clean.
`;

export const registerSkillTools = (server: McpServer) => {
    server.registerTool(
        "install_skill",
        {
            description:
                "Install the Salesforce MCP Server skill for Claude Code into the current working directory (.claude/skills/salesforce/SKILL.md). The skill provides domain-specific guidance on how to effectively use all 40 Salesforce tools, 5 prompts, and 5 resources together. Once installed, the skill persists across Claude Code sessions in this project and helps Claude choose the right tools, chain them into workflows, and avoid common Salesforce mistakes.",
            inputSchema: {
                input: z.object({
                    force: z
                        .boolean()
                        .optional()
                        .describe(
                            "Overwrite existing skill file if it already exists. Default is false (skip if already installed).",
                        ),
                }),
            },
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        async ({ input }) => {
            try {
                const cwd = process.cwd();
                const skillDir = join(cwd, ".claude", "skills", "salesforce");
                const skillPath = join(skillDir, "SKILL.md");

                if (existsSync(skillPath) && !input.force) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({
                                    success: true,
                                    message:
                                        "Skill already installed. Use force: true to overwrite.",
                                    path: skillPath,
                                }),
                            },
                        ],
                    };
                }

                mkdirSync(skillDir, { recursive: true });
                writeFileSync(skillPath, SKILL_CONTENT, "utf-8");

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: true,
                                message: "Skill installed successfully",
                                path: skillPath,
                            }),
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    error.message || "Failed to install skill",
                            }),
                        },
                    ],
                };
            }
        },
    );
};
