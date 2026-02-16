# Salesforce MCP Server

[![NPM Version](https://img.shields.io/npm/v/@advanced-communities/salesforce-mcp-server)](https://www.npmjs.com/package/@advanced-communities/salesforce-mcp-server)
[![License](https://img.shields.io/npm/l/@advanced-communities/salesforce-mcp-server)](https://github.com/advancedcommunities/salesforce-mcp-server/blob/main/LICENSE)

## What is it

Salesforce MCP Server is a Model Context Protocol (MCP) server that enables AI assistants to interact with Salesforce organizations. It provides a set of tools that allow AI models to execute Apex code, query data, describe objects, and manage Salesforce org connections through the Salesforce CLI.

**NPM Package**: [@advanced-communities/salesforce-mcp-server](https://www.npmjs.com/package/@advanced-communities/salesforce-mcp-server)

### Installation

#### Prerequisites

- [Node.js (v18 or higher)](https://nodejs.org/en/download)
- [Salesforce CLI (`sf`) installed and configured](https://developer.salesforce.com/tools/salesforcecli)
- At least one authenticated Salesforce org

#### Option 1: NPM Installation (Recommended)

The easiest way to install Salesforce MCP Server is directly from NPM using `npx`:

```bash
npx @advanced-communities/salesforce-mcp-server
```

This command will:

- Download the latest version from NPM
- Run the server directly without manual installation
- Automatically handle all dependencies

**Benefits of NPM Installation:**

- ✅ No manual building required
- ✅ Always get the latest stable version
- ✅ Automatic dependency management
- ✅ Easy updates with `npm update`
- ✅ No need to clone the repository

#### Option 2: Desktop Extension (DXT) - One-Click Installation

For a fully managed installation experience:

1. Download the latest `salesforce-mcp-server.dxt` file from the [releases page](https://github.com/advancedcommunities/salesforce-mcp-server/releases)
2. Double-click the `.dxt` file to install
3. The extension will be automatically configured in your AI client
4. All dependencies will be managed automatically

#### Option 3: Manual Installation - Build from source

For development or customization:

1. Clone the repository: `git clone https://github.com/advancedcommunities/salesforce-mcp-server.git`
2. Navigate to the directory: `cd salesforce-mcp-server`
3. Install and build: `npm install && npm run build`
4. The server will be available at `build/index.js`

#### Add MCP Configuration to your client

To be able to run the MCP Server – you need a client. The client can be any AI app which supports the MCP protocol, such as:

- [Claude Desktop](https://claude.ai/download)
- [Claude Code](https://www.anthropic.com/claude-code)
- [Codex CLI](https://github.com/openai/codex)
- [VS Code Copilot](https://code.visualstudio.com/docs/copilot/overview)
- [Cursor](https://cursor.com/downloads)

#### Use it with Claude Desktop

1. Install [Claude Desktop](https://claude.ai/download) from Anthropic.
2. Open it up and authenticate to Claude.
3. Edit your config file at:
    - Mac: `~/Library/Application\ Support/Claude/claude_desktop_config.json`
    - Windows: `C:\\Users\\YOUR_USERNAME\\AppData\\Roaming\\Claude\\claude_desktop_config.json`

    > **If you can't find the file.** Open Claude Desktop, open the Settings menu, go to the Developer section and click Edit Config inside the servers section.
    > Open and edit this file using the instructions below.

4. Add the following to your config file under the `"mcpServers"` key:

    ```json
    {
        "mcpServers": {
            "salesforce-mcp-server": {
                "command": "npx",
                "args": ["@advanced-communities/salesforce-mcp-server"]
            }
        }
    }
    ```

    **With environment variables (optional):**

    ```json
    {
        "mcpServers": {
            "salesforce-mcp-server": {
                "command": "npx",
                "args": ["@advanced-communities/salesforce-mcp-server"],
                "env": {
                    "READ_ONLY": "true",
                    "ALLOWED_ORGS": "dev,qa,staging"
                }
            }
        }
    }
    ```

5. Restart Claude Desktop (quit & re-open the app). Now you are able to use the MCP in the Claude Desktop.

#### Use it with Claude Code

1. Install [Claude Code](https://www.anthropic.com/claude-code).
2. Open it up and authenticate to Claude by runnung the `claude` command in your terminal.
3. Execute one of the following commands in your terminal:

    **Basic installation (local scope - default):**

    ```shell
    claude mcp add salesforce-mcp-server npx @advanced-communities/salesforce-mcp-server
    ```

    **User scope installation (recommended for global access):**

    ```shell
    claude mcp add --scope user salesforce-mcp-server npx @advanced-communities/salesforce-mcp-server
    ```

    **With environment variables:**

    ```shell
    # Read-only mode (local scope)
    claude mcp add salesforce-mcp-server npx @advanced-communities/salesforce-mcp-server -e READ_ONLY=true

    # Read-only mode (user scope)
    claude mcp add --scope user salesforce-mcp-server npx @advanced-communities/salesforce-mcp-server -e READ_ONLY=true

    # Restrict to specific orgs (user scope)
    claude mcp add --scope user salesforce-mcp-server npx @advanced-communities/salesforce-mcp-server -e ALLOWED_ORGS=dev,qa,staging

    # Both restrictions (user scope)
    claude mcp add --scope user salesforce-mcp-server npx @advanced-communities/salesforce-mcp-server -e READ_ONLY=true -e ALLOWED_ORGS=production
    ```

    > **Note**: By default, Claude Code installs MCP servers in local scope (current directory). Use `--scope user` to install globally for all projects.

#### Use it with Codex CLI

The Codex CLI can be configured to leverage MCP servers by defining an [mcp_servers](https://github.com/openai/codex/blob/main/codex-rs/config.md#mcp_servers) section in `~/.codex/config.toml`.
It is intended to mirror how tools such as Claude and Cursor define mcpServers in their respective JSON config files,
though the Codex format is slightly different since it uses TOML rather than JSON, e.g.:

```toml
[mcp_servers.salesforce-mcp-server]
command = "npx"
args = ["@advanced-communities/salesforce-mcp-server"]

# Optional: Add environment variables
[mcp_servers.salesforce-mcp-server.env]
READ_ONLY = "true"
ALLOWED_ORGS = "dev,qa,staging"
```

#### Use it with VS Code

1. In VS Code, open the Command Palette by pressing `Command + Shift + P` or `Ctrl + Shift + P`.
2. Type "MCP Add", select the `MCP: Add Server` option.
3. Select `Command(stdio)` option.
4. Put the `npx @advanced-communities/salesforce-mcp-server` into the command input.
5. For MCP Server Id put `salesforce-mcp-server`.
6. Choose either `Global` or `Workspace` installation option.
7. (Optional) To add environment variables, manually edit the VS Code settings:
    - Open settings.json (`Preferences: Open Settings (JSON)`)
    - Add environment variables to your MCP server configuration:
    ```json
    "mcp.servers": {
      "salesforce-mcp-server": {
        "command": "npx",
        "args": ["@advanced-communities/salesforce-mcp-server"],
        "env": {
          "READ_ONLY": "true",
          "ALLOWED_ORGS": "dev,qa"
        }
      }
    }
    ```

#### Use it with Cursor

1. Install [Cursor](https://cursor.com/downloads)
2. Open it up and create your account and connect to a model provider
3. Open `Cursor` -> `Settings` -> `Cursor Settings` -> `Mcp`
4. `Add new global MCP Server`
5. This will drop you into an editor of the JSON config. Fill in a value for the key `salesforce-mcp-server`:

    ```json
    {
        "mcpServers": {
            "salesforce-mcp-server": {
                "command": "npx",
                "args": ["@advanced-communities/salesforce-mcp-server"]
            }
        }
    }
    ```

    **With environment variables (optional):**

    ```json
    {
        "mcpServers": {
            "salesforce-mcp-server": {
                "command": "npx",
                "args": ["@advanced-communities/salesforce-mcp-server"],
                "env": {
                    "READ_ONLY": "true",
                    "ALLOWED_ORGS": "production,staging"
                }
            }
        }
    }
    ```

    > If there are any existing keys under mcpServer, don't delete them. Add salesforce-mcp-server to the end.

6. Save the file. Go back to the `Cursor Settings` tab. You should see salesforce-mcp-server listed and the dot should go green.
7. Open `Composer` view and toggle from `normal` to `agent` (small text on bottom of input)
8. You can now use tools

## Configuration

The server supports the following environment variables for access control:

- `READ_ONLY=true` - Prevents execution of Apex code (anonymous execution and tests)
- `ALLOWED_ORGS=ALL` - Allow access to all orgs (default)
- `ALLOWED_ORGS=org1,org2,org3` - Restrict access to specific org aliases

When ALLOWED_ORGS is set, the `list_connected_salesforce_orgs` tool will only show orgs that match the allowed list.

### Default Org

All tools that interact with a Salesforce org accept an optional `targetOrg` parameter. When `targetOrg` is not provided, the server automatically resolves the default org from your Salesforce CLI configuration.

To set a default org:

```bash
sf config set target-org <alias-or-username>
```

To check which org is currently set as default:

```bash
sf config get target-org
```

When a default org is configured, you can use any tool without specifying `targetOrg` — the server will use the default automatically. If no `targetOrg` is provided and no default org is configured, the tool will return an error asking you to either provide `targetOrg` or set a default.

You can check the current default org via the `get_server_permissions` tool, which includes it in its response.

### Permission Examples

**Read-only access to all orgs:**

```json
{
    "mcpServers": {
        "salesforce-mcp-server": {
            "command": "npx",
            "args": ["@advanced-communities/salesforce-mcp-server"],
            "env": {
                "READ_ONLY": "true"
            }
        }
    }
}
```

**Full access to specific orgs only:**

```json
{
    "mcpServers": {
        "salesforce-mcp-server": {
            "command": "npx",
            "args": ["@advanced-communities/salesforce-mcp-server"],
            "env": {
                "ALLOWED_ORGS": "dev,qa,staging"
            }
        }
    }
}
```

**Read-only access to specific orgs:**

```json
{
    "mcpServers": {
        "salesforce-mcp-server": {
            "command": "npx",
            "args": ["@advanced-communities/salesforce-mcp-server"],
            "env": {
                "READ_ONLY": "true",
                "ALLOWED_ORGS": "production,prod-backup"
            }
        }
    }
}
```

You can check the current permission settings using the `get_server_permissions` tool.

## How to use it

Once the SF MCP Server is configured in your AI client, you can interact with Salesforce using natural language. The AI assistant will have access to 39 powerful tools:

### Available Tools

#### 1. List Connected Salesforce Orgs

View all Salesforce orgs currently authenticated with the Salesforce CLI.

**Example prompts:**

- "Show me all connected Salesforce orgs"
- "List my available Salesforce organizations"
- "Which Salesforce orgs can I access?"

#### 2. List Objects in an Org

Retrieve all standard and custom objects available in a specific Salesforce org.

**Example prompts:**

- "List all custom objects in my dev org"
- "Show me all objects in the production org"
- "What custom objects exist in sandbox1?"

#### 3. Describe an Object

Get detailed metadata about a specific Salesforce object, including fields, relationships, and properties.

**Example prompts:**

- "Describe the Account object in my org"
- "Show me all fields on the Custom_Object\_\_c in dev org"
- "What are the relationships on the Contact object?"

#### 4. Execute Apex Code

Run anonymous Apex code directly in a Salesforce org and see the debug output.

**Example prompts:**

- "Execute this Apex in my dev org: System.debug('Hello World');"
- "Run a query in Apex to count all Accounts"
- "Execute Apex code to create a test Account record"

#### 5. Query Records

Execute SOQL queries and retrieve results in JSON format.

**Example prompts:**

- "Query the first 10 Accounts from my org"
- "Find all Contacts with email domain '@example.com'"
- "Get Opportunities closed this month with amount over $10,000"
- "Query all Case records created today"

#### 6. Query Records to File

Execute SOQL queries and save results to CSV or JSON files.

**Example prompts:**

- "Export all Leads to a CSV file"
- "Save all Opportunities from Q4 2024 to a JSON file"
- "Create a CSV export of Accounts with their related Contacts"

#### 7. Run Apex Tests

Execute Apex test classes with various options including test level and code coverage.

**Example prompts:**

- "Run all tests in my dev org"
- "Execute the AccountTriggerTest class with code coverage"
- "Run all local tests excluding managed packages"

#### 8. Get Apex Test Results

Retrieve results from a previous asynchronous Apex test run.

**Example prompts:**

- "Get the results of test run ID 707xx0000000001"
- "Show me the code coverage from the last test run"

#### 9. Get Apex Code Coverage

Get code coverage information for a Salesforce org.

**Example prompts:**

- "What's the overall code coverage in my org?"
- "Show code coverage from the latest test run"

#### 10. Generate Apex Class

Generate metadata source files for a new Apex class.

**Example prompts:**

- "Generate a new Apex class called AccountHelper"
- "Create an Apex controller class named MyCustomController"
- "Generate a batch class called DataCleanupBatch in the classes directory"

#### 11. Generate Apex Trigger

Generate metadata source files for a new Apex trigger.

**Example prompts:**

- "Generate a trigger called AccountTrigger for the Account object"
- "Create a before insert trigger for the Contact object"
- "Generate an after update trigger for MyCustomObject\_\_c"

#### 12. List Apex Logs

Fetch and list Apex debug logs from the org.

**Example prompts:**

- "Show me all Apex debug logs in my dev org"
- "List the recent debug logs from production"
- "Get the IDs of debug logs in sandbox"

#### 13. Get Apex Log

Fetch specific Apex debug logs or recent logs from the org.

**Example prompts:**

- "Get the debug log with ID 07L...."
- "Show me the last 5 debug logs from my org"
- "Fetch the most recent debug log from production"

#### 14. Login to Salesforce Org

Authenticate and login to a Salesforce org via web browser.

**Example prompts:**

- "Login to a new production org with alias 'prod'"
- "Connect to a sandbox with alias 'dev-sandbox'"

#### 15. Get Server Permissions

Check current server permission settings.

**Example prompts:**

- "Show me the current server permissions"
- "What orgs am I allowed to access?"

#### 16. Run Code Analyzer

Analyze your code with configurable rules to ensure good coding practices.

**Example prompts:**

- "Run code analyzer on all Apex classes"
- "Analyze my Lightning Web Components for security issues"
- "Check PMD rules on the force-app directory"

#### 17. List Code Analyzer Rules

List available rules for code analysis.

**Example prompts:**

- "Show me all available code analyzer rules"
- "List security-related code analysis rules"
- "What ESLint rules are available?"

#### 18. Scanner Run

Scan a codebase with various security and quality rules using multiple engines.

**Example prompts:**

- "Scan all Apex files for security vulnerabilities"
- "Run PMD and ESLint scanners on my codebase"
- "Check for retire-js vulnerabilities in my JavaScript files"
- "Scan with high severity threshold and save results to CSV"

#### 19. Scanner Run DFA

Run Salesforce Graph Engine for data flow analysis to identify complex security issues.

**Example prompts:**

- "Run data flow analysis on my Apex controllers"
- "Check for SOQL injection vulnerabilities using Graph Engine"
- "Perform path-based security analysis on all Apex classes"
- "Run DFA with pilot rules enabled"

#### 20. Assign Permission Set

Assign permission sets to one or more org users.

**Example prompts:**

- "Assign the DreamHouse permission set to the admin user in my dev org"
- "Grant CloudHouse and AppBuilder permission sets to user@example.com"
- "Assign multiple permission sets to a list of users in sandbox"

#### 21. Assign Permission Set License

Assign permission set licenses to org users.

**Example prompts:**

- "Assign the Sales Cloud license to user@example.com"
- "Grant Service Cloud permission set license to multiple users"
- "Assign Platform Event license to the admin user"

#### 22. Display User

Display information about a Salesforce user including profile, org ID, and access details.

**Example prompts:**

- "Show me information about the admin user in my org"
- "Display user details for user@example.com"
- "Get the profile and access token for the current user"

#### 23. List Metadata

List metadata components and properties of a specified type.

**Example prompts:**

- "List all CustomObject components in my org"
- "Show me all Dashboard components in the Sales folder"
- "Get all EmailTemplate metadata with API version 60.0"
- "List Layout components and save to a file"

#### 24. List Metadata Types

Display details about all metadata types enabled for your org.

**Example prompts:**

- "Show me all available metadata types in my org"
- "List metadata types for package.xml creation"
- "Get all enabled metadata types with API version 60.0"
- "Display metadata types and save to file for reference"

#### 25. Logout

Log out of a Salesforce org, removing stored authentication.

**Example prompts:**

- "Logout from my dev org"
- "Remove authentication for sandbox1"
- "Logout from all connected orgs"

#### 26. Open

Open a Salesforce org in your browser.

**Example prompts:**

- "Open my dev org in Chrome"
- "Open the Lightning Experience page in my sandbox"
- "Open my org in private/incognito mode"
- "Open a Visualforce page /apex/MyPage in production"
- "Open my FlexiPage in Lightning App Builder"

#### 27. Open Record

Open a specific Salesforce record in the browser.

**Example prompts:**

- "Open record 001XX0000XXXXX in my dev org"
- "Navigate to Account record 001... in production"
- "Show me the Contact record 003... in the browser"

#### 28. Create Record

Create a new record in a Salesforce org using the REST API.

**Example prompts:**

- "Create a new Account with Name 'Acme Corp' and Type 'Customer'"
- "Insert a Contact record with FirstName 'John' and LastName 'Doe'"
- "Create a Case with Subject 'Technical Issue' and Priority 'High'"
- "Add a new Lead with Company 'Tech Startup' and Email 'lead@example.com'"

#### 29. Update Record

Update an existing record in a Salesforce org using the REST API.

**Example prompts:**

- "Update Account 001XX... to set BillingCity to 'San Francisco'"
- "Change the Status of Opportunity 006XX... to 'Closed Won'"
- "Update Contact 003XX... with Phone '(555) 123-4567'"
- "Modify Case 500XX... to set Priority to 'Critical'"

#### 30. Delete Record

Delete a record from a Salesforce org using the REST API.

**Example prompts:**

- "Delete the Account record 001XX..."
- "Remove Contact 003XX... from the org"
- "Delete Lead record 00QXX..."
- "Remove the test Case record 500XX..."

#### 31. Package Install

Install or upgrade a package version in a Salesforce org.

**Example prompts:**

- "Install package 04tXXXXXXXXXXXXXX in my dev org"
- "Upgrade the package with ID 04t... in production with 10 minute wait time"
- "Install a protected package with key 'mykey123' in sandbox"
- "Install package and compile only package Apex code"
- "Upgrade unlocked package and deprecate removed components"

#### 32. Package Uninstall

Uninstall a second-generation package from a Salesforce org.

**Example prompts:**

- "Uninstall package 04tXXXXXXXXXXXXXX from my dev org"
- "Remove the package with alias 'old_package' from production"
- "Uninstall package and wait 5 minutes for completion"
- "Remove package with spaces in alias from sandbox"

#### 33. Schema Generate Tab

Generate metadata source files for a new custom tab on a custom object.

**Example prompts:**

- "Create a tab for MyObject\_\_c with icon 54 in the tabs directory"
- "Generate a custom tab for Invoice\_\_c object with icon 25"
- "Add a navigation tab for Customer\_\_c with icon 75 in force-app/main/default/tabs"
- "Create a tab for Product\_\_c custom object with default icon"

#### 34. Search Records

Execute SOSL text-based searches across multiple objects. This is the primary tool for finding records that mention or contain specific text across your Salesforce org.

**Example prompts:**

- "Search for 'Anna Jones' in all Name fields"
- "Find records containing 'Acme' across all objects"
- "Search for phone number '415-555-1234' in Contact and Lead"
- "Find all records mentioning our competitor 'Acme Corp' across Accounts, Opportunities, and Cases"
- "Execute SOSL: FIND {Smith} IN ALL FIELDS RETURNING Contact, Lead"

#### 35. Generate Lightning Component

Generate Lightning Web Components (LWC) or Aura components with configurable templates and output directories.

**Example prompts:**

- "Generate a Lightning Web Component called AccountList"
- "Create an Aura component named ContactForm in the components directory"
- "Generate an LWC with analyticsDashboard template called SalesMetrics"
- "Create a Lightning component MyCustomView with default template"

#### 36. Deploy Metadata to Org

Deploy metadata components to a Salesforce org with various configuration options including test execution.

**Example prompts:**

- "Deploy all metadata from force-app directory to my dev org"
- "Validate deployment to production with all tests but don't save (dry run)"
- "Deploy specific Apex classes matching 'Account\*' pattern to sandbox"
- "Deploy using package.xml manifest with RunLocalTests"
- "Deploy metadata and run specific test classes: TestClass1, TestClass2"

#### 37. Get Default Org

Get the current default target org configured in the Salesforce CLI. This is the org used automatically when no `targetOrg` is specified.

**Example prompts:**

- "What is my default Salesforce org?"
- "Show me the current default target org"
- "Which org am I connected to by default?"

#### 38. Set Default Org

Set the default target org for the Salesforce CLI. Once set, all tools will use this org when no `targetOrg` is specified.

**Example prompts:**

- "Set my default org to dev-sandbox"
- "Change the default target org to production"
- "Make 'staging' my default Salesforce org"

#### 39. Clear Default Org

Clear the default target org from the Salesforce CLI configuration. After clearing, all tools will require an explicit `targetOrg` parameter.

**Example prompts:**

- "Clear the default Salesforce org"
- "Remove the default target org setting"
- "Unset my default org"

### Available Resources

The server exposes MCP Resources that clients can browse and include in conversations for contextual data about your Salesforce orgs.

| #   | Resource           | URI                                      | Description                                                                    |
| --- | ------------------ | ---------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Server Permissions | `salesforce://permissions`               | Current server permission settings (read-only mode, allowed orgs, default org) |
| 2   | Org Metadata       | `salesforce://org/{alias}/metadata`      | Org metadata summary with available metadata types                             |
| 3   | Org Objects        | `salesforce://org/{alias}/objects`       | List of all standard and custom SObjects in the org                            |
| 4   | Object Schema      | `salesforce://org/{alias}/object/{name}` | Detailed schema for a specific SObject (fields, relationships, record types)   |
| 5   | Org Limits         | `salesforce://org/{alias}/limits`        | API limits and usage (daily API calls, storage, governor limits)               |

Resources support autocomplete for org aliases and object names. Template resources (2-5) respect the `ALLOWED_ORGS` permission setting.

### Available Prompts

The server provides MCP Prompts — templated workflows that appear as slash commands in clients like Claude Desktop. They fetch live org data and guide the AI through common Salesforce tasks.

| #   | Prompt             | Arguments                              | Description                                                                |
| --- | ------------------ | -------------------------------------- | -------------------------------------------------------------------------- |
| 1   | `soql_builder`     | `objectName` (required), `targetOrg`   | Describe an SObject and interactively build a SOQL query step by step      |
| 2   | `apex_review`      | `className` (required), `targetOrg`    | Fetch an Apex class from the org and perform a structured code review      |
| 3   | `org_health_check` | `targetOrg`                            | Fetch org info, API limits, and test coverage to assess org health         |
| 4   | `deploy_checklist` | `targetOrg`                            | Generate a pre-deployment readiness checklist with live org data           |
| 5   | `debug_apex`       | `targetOrg`, `logId`                   | Fetch and analyze an Apex debug log for errors and performance issues      |

All prompts respect the `ALLOWED_ORGS` permission setting and use the default org when `targetOrg` is not provided.

### Practical Examples

#### Example 1: Data Analysis

```
User: "I need to analyze our customer data. First, show me what custom objects we have in the production org."

AI: [Lists all custom objects]

User: "Great! Now query all Customer__c records created this year and export them to CSV."

AI: [Executes query and creates CSV file]
```

#### Example 2: Debugging

```
User: "I'm having issues with a trigger. Can you execute this Apex to test it:
List<Account> accs = [SELECT Id, Name FROM Account LIMIT 5];
for(Account a : accs) {
    System.debug('Account: ' + a.Name);
}"

AI: [Executes the code and shows debug logs]
```

#### Example 3: Schema Documentation

```
User: "I need to document our data model. Can you describe the Order__c object including all its fields and relationships?"

AI: [Provides detailed object metadata]
```

### Structured Tool Output

The following tools support MCP structured output (`outputSchema` + `structuredContent`) for programmatic result parsing:

- `query_records` — returns `{ targetOrg, records }`
- `sobject_list` — returns `{ targetOrg, sobjects }`
- `sobject_describe` — returns `{ targetOrg, name, label, fields, childRelationships, recordTypeInfos, ... }`
- `list_connected_salesforce_orgs` — returns `{ devHubOrgs, production, sandboxes, scratchOrgs, totalOrgs }`
- `get_apex_test_results` — returns `{ targetOrg, summary, tests, codecoverage }`

Clients that support the MCP `outputSchema` capability will receive validated structured data in addition to the text content.

### Tips for Best Results

1. **Specify the Target Org**: Always mention which org you want to work with (e.g., "in my dev org", "using production")

2. **Be Specific with Queries**: Provide field names and conditions for SOQL queries
    - Good: "Query Account records with Type = 'Customer' and show Id, Name, and CreatedDate"
    - Less specific: "Get some Accounts"

3. **Object Names**: You can use either user-friendly names or API names - the AI assistant will use the describe tools to find the correct API names
    - Both work: "Query Custom Object records" or "Query Custom_Object\_\_c records"
    - The assistant will automatically resolve field names too

4. **Apex Code Formatting**: When providing Apex code, you can use code blocks or inline code

5. **File Exports**: Specify the format (CSV or JSON) when exporting query results

### Troubleshooting

**"No orgs found"**: Make sure you have authenticated orgs using `sf org login`

**"Object not found"**: Verify the object exists and you're using the correct API name

**"Query error"**: Check your SOQL syntax and field names

**"Apex execution failed"**: Review the debug logs for specific error messages

### Security Considerations

- The server executes commands with the permissions of the authenticated Salesforce user
- Be cautious when executing DML operations in production orgs
- Review Apex code before execution, especially in production environments
- Consider using sandbox orgs for testing and development

### Building Desktop Extension (DXT) Locally

If you want to build the Desktop Extension file yourself:

1. Clone the repository and navigate to the `salesforce-mcp-server` directory
2. Install dependencies: `npm install`
3. Build the DXT file: `npm run build:dxt`
4. The `.dxt` file will be created in the `dist/` directory
5. Share this file with others for easy one-click installation

For more details about Desktop Extensions, see [DXT.md](./DXT.md)
