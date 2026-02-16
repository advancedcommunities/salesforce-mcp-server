# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.2] - 2026-02-16

### Fixed

- **CRUD Tools Input Validation**: Fixed `create_record`, `update_record`, and `delete_record` tools to accept both stringified JSON and object input. Added `flexibleInput` wrapper using Zod's `z.preprocess` to automatically parse stringified JSON when clients send input as strings instead of objects
- **CRUD Tool Descriptions**: Improved descriptions for CRUD tools to explicitly document accepted input format with parameter names and examples

## [1.6.1] - 2026-02-16

### Fixed

- **Icon Loading**: Fixed graceful fallback when icon.png is missing, preventing crashes when running via npx where only the build/ folder is included

## [1.6.0] - 2026-02-16

### Added

- **MCP Resources**: Five new resources for browsable org context:
  - `salesforce://permissions` - Current server permission settings
  - `salesforce://org/{alias}/metadata` - Org metadata summary with available metadata types
  - `salesforce://org/{alias}/objects` - List of all standard and custom SObjects
  - `salesforce://org/{alias}/object/{name}` - Detailed schema for a specific SObject
  - `salesforce://org/{alias}/limits` - API limits and usage information
  - Resource URIs support autocomplete for org aliases and object names

- **MCP Prompts**: Five new templated workflows for guided Salesforce tasks:
  - `soql_builder` - Describe an SObject and interactively build SOQL queries
  - `apex_review` - Fetch and perform structured code review of Apex classes
  - `org_health_check` - Assess org health with live org data
  - `deploy_checklist` - Generate pre-deployment readiness checklist
  - `debug_apex` - Fetch and analyze Apex debug logs for errors and performance issues
  - All prompts respect `ALLOWED_ORGS` permission and support default org fallback

- **MCP Structured Output**: Five core tools now return validated structured data via `outputSchema`:
  - `query_records` - Returns `{ targetOrg, records }`
  - `sobject_list` - Returns `{ targetOrg, sobjects }`
  - `sobject_describe` - Returns detailed SObject schema with fields and relationships
  - `list_connected_salesforce_orgs` - Returns organized org data by type
  - `get_apex_test_results` - Returns test summary, individual results, and code coverage

- **MCP Progress Reporting**: Long-running tools now report real-time progress:
  - `deploy_start` - Reports deployment phases (resolving → validating → deploying)
  - `run_apex_tests` - Reports test execution progress
  - `scanner_run` - Reports scanning progress
  - `scanner_run_dfa` - Reports data flow analysis progress
  - `run_code_analyzer` - Reports code analysis progress
  - `query_records_to_file` - Reports export progress

- **MCP Elicitation**: Destructive operations now request user confirmation:
  - `delete_record` - Confirms before permanently deleting records
  - `package_uninstall` - Confirms before uninstalling packages
  - `logout` - Confirms before logging out of orgs
  - `deploy_start` - Confirms before deployments (skipped for dry-runs)
  - Gracefully degrades on clients without elicitation support

- **MCP Completions**: Argument auto-completion for prompts and resources:
  - Prompt arguments auto-complete with connected org aliases
  - `soql_builder` auto-completes SObject names from target org
  - Resource URI variables auto-complete org aliases and object names
  - All completions respect `ALLOWED_ORGS` permission

- **MCP Logging**: Structured logging with named loggers and severity levels:
  - Logger names: `salesforce`, `cli`, `permissions`
  - Log levels: `debug`, `info`, `warning`, `error`, `critical`
  - All tool execution and CLI commands logged with appropriate levels
  - Clients can set minimum log level via `logging/setLevel`

- **MCP Implementation Metadata**: Enhanced server identity and branding:
  - Server title: "Salesforce MCP Server" with human-readable display
  - Embedded base64-encoded server icon (PNG) for client UI display
  - Improved server description with version and capabilities

- **MCP Registry Support**: Registry publication and verification:
  - `mcpName` in package.json for MCP registry verification (`io.github.advancedcommunities/salesforce-mcp-server`)
  - `server.json` for MCP registry publishing with full server metadata
  - Published to official MCP registry at [mcp.run](https://mcp.run)

- **Tool Annotation System**: All 39 tools migrated to modern `registerTool()` with ToolAnnotations:
  - Improved type safety and consistency
  - Better IDE support and documentation generation
  - Easier maintenance of tool metadata

### Changed

- **TypeScript Configuration**: Updated to ES2023/NodeNext for improved compatibility
  - Resolves module resolution issues
  - Better type checking with latest TypeScript features

- **Dependencies**: Updated core dependencies:
  - @modelcontextprotocol/sdk: Updated to ^1.26.0 with full MCP spec support
  - zod: Updated to ^4.3.6 for improved schema validation

- **Packaging Format**: Migrated from DXT to MCPB format:
  - Better distribution and installation experience
  - Official MCP bundle format for broader client support

## [1.5.6] - 2026-02-09

### Added

- **Default Org Fallback**: All 24 tools that interact with a Salesforce org now accept `targetOrg` as optional — when omitted, the server resolves the default org from SF CLI (`sf config get target-org`)
- **New `resolveTargetOrg` utility** (`src/utils/resolveTargetOrg.ts`): Centralized default org resolution with 30-second caching to avoid repeated subprocess calls
- **New tools for default org management**:
    - `get_default_org` - View the current default target org
    - `set_default_org` - Change the default target org
    - `clear_default_org` - Unset the default target org
- **Org visibility in responses**: Every tool response now includes `targetOrg` so users always see which org was used, especially when the default fallback is applied
- **`get_server_permissions` enhanced**: Now shows the configured default org in its output

### Changed

- **CLAUDE.md Restructured**: Converted legacy "Development Memories" section into native Claude Code instructions
    - Renamed "Development Memories" to "Workflow Rules" with clear, actionable directives
    - Moved code-related rules (JSON formatting, permission checks) into "Important Implementation Notes"
    - Integrated tool registration reminder into "Adding New Tools" steps
    - Consolidated documentation update reminders into single workflow rule
    - Added parallel task execution instruction for improved development efficiency

## [1.5.5] - 2025-10-26

### Fixed

- **Salesforce CLI Path Resolution on Windows**: Fixed issue where `sf` command in PATH was being incorrectly quoted on Windows
    - The `deploy_start` tool and all other SF CLI commands now work correctly when SF CLI is in the system PATH
    - Only quote SF CLI paths when they contain spaces (indicating full path like "C:\Program Files\sf\bin\sf.cmd")
    - Don't quote plain command names (like "sf") that should be resolved from PATH
    - Fixes "Command failed: 'sf' is not recognized" errors on Windows
    - Applied fix to both `executeSfCommand` and `executeSfCommandRaw` functions in sfCommand.ts

## [1.5.4] - 2025-10-22

### Fixed

- **Salesforce CLI Error Handling**: Fixed `executeSfCommand` to properly parse and return JSON error responses from Salesforce CLI
    - When SF CLI commands fail with `--json` flag, errors are now properly captured from stdout
    - Error details (name, message, exitCode, context, stack) are now correctly returned to MCP clients
    - Fixes issue where deployment errors like "No source-backed components present in the package" were not visible
    - Maintains backward compatibility with existing error handling

## [1.5.3] - 2025-09-20

### Fixed

- **Deploy Tool Enhancement**: Fixed `deploy_start` tool's `sourceDirectory` parameter description to clearly indicate it accepts both directories and individual file paths for single-file deployments

## [1.5.2] - 2025-09-15

### Changed

- **Improved Tool Descriptions**: Refactored and simplified descriptions across multiple tools for better clarity and conciseness
    - Enhanced parameter descriptions for code analyzer tools to be more user-friendly
    - Improved scanner tool descriptions for better understanding of security analysis capabilities
    - Clarified deploy_start tool parameter descriptions for deployment options
    - Added missing description for generate_component tool in Lightning tools
- **Code Quality**: Removed unused imports and improved code organization
    - Removed unused `executeSfCommandRaw` import from apex.ts
    - General code refactoring for better maintainability

## [1.5.1] - 2025-09-03

### Fixed

- **Apex Test Tool**: Corrected input parameter descriptions for the `run_apex_tests` tool to improve clarity and accuracy

## [1.5.0] - 2025-09-02

### Removed

- **Interactive Schema Generation Tools**: Removed `schema_generate_field` and `schema_generate_sobject` tools
    - These tools required interactive CLI prompts which are not compatible with MCP server automation
    - Removed from manifest.json tools array
    - Only `schema_generate_tab` remains as it doesn't require interactive input
    - Updated documentation to reflect new tool count (36 tools instead of 38)

## [1.4.0] - 2025-08-31

### Added

- **Project Deployment Tool**: New tool for deploying metadata to Salesforce orgs
    - `deploy_start` - Deploy metadata components to target org with extensive configuration options
    - Supports multiple deployment sources: manifest (package.xml), metadata components, source directories
    - Configurable test execution levels (NoTestRun, RunSpecifiedTests, RunLocalTests, RunAllTestsInOrg)
    - Dry-run capability for validation without actual deployment
    - Support for single package deployments
    - Respects READ_ONLY and ALLOWED_ORGS permissions
    - Integrated with existing permission system for secure deployments

## [1.3.2] - 2025-08-31

### Added

- **Lightning Component Generation**: New tool for generating Lightning Web Components (LWC) and Aura components
    - `generate_component` - Generate Lightning component bundles with metadata
    - Supports both LWC and Aura component types
    - Configurable templates (default, analyticsDashboard, analyticsDashboardWithStep)
    - Custom output directory support with default fallback to current directory
    - Respects READ_ONLY permissions

## [1.3.1] - 2025-08-21

### Fixed

- **NPM Package Execution**: Added shebang line (`#!/usr/bin/env node`) to fix npm package execution when run via `npx` - resolves "import: command not found" errors and enables direct VS Code MCP configuration usage

## [1.3.0] - 2025-08-19

### Added

- **Record CRUD Operations via REST API**: Complete suite of tools for managing Salesforce records
    - `create_record` - Create new records with field values via REST API
        - Supports all standard and custom objects
        - JSON-based field value specification
        - Returns created record ID on success
        - Respects READ_ONLY and ALLOWED_ORGS permissions
    - `update_record` - Update existing records with new field values
        - Partial updates (only specified fields are modified)
        - Supports 15 or 18 character record IDs
        - JSON-based field value specification
        - Respects READ_ONLY and ALLOWED_ORGS permissions
    - `delete_record` - Permanently delete records from Salesforce
        - Supports all deletable objects
        - Permanent removal (use with caution)
        - Respects READ_ONLY and ALLOWED_ORGS permissions
    - All CRUD operations use native REST API for better performance
    - Integrated with existing connection management system
    - Enhanced connection utilities with `getOrgAccessToken()` and improved `listAllOrgs()` with API version info
    - Centralized REST API execution with proper read-only mode enforcement

## [1.2.6] - 2025-08-15

### Fixed

- **Improved Tool Selection**: Enhanced tool descriptions to ensure AI assistants correctly choose between SOQL and SOSL
    - `search_records` tool description now emphasizes it's the PRIMARY tool for text searches across multiple objects
    - `query_records` tool description clarifies it's for SINGLE object queries with field conditions
    - Added explicit guidance that text searches (finding mentions, keywords, company names) should use SOSL not multiple SOQL queries
    - Updated manifest.json with clearer, more distinct tool descriptions
    - This fixes the issue where AI would execute multiple SOQL queries instead of a single SOSL search

## [1.2.5] - 2025-08-15

### Added

- **Search Records Tool**: New `search_records` tool for executing SOSL (Salesforce Object Search Language) queries across multiple objects
    - Supports text-based searches across multiple objects and fields simultaneously
    - Query execution via inline or file input
    - Multiple output formats (human, csv, json)
    - Respects permission settings

- **Apex Generation Tools**: New tools for generating Apex code with metadata
    - `generate_class` - Generate Apex class files with metadata
        - Creates .cls and .cls-meta.xml files
        - Supports custom output directories
        - Automatic "classes" directory creation
    - `generate_trigger` - Generate Apex trigger files with metadata
        - Creates .trigger and .trigger-meta.xml files
        - Supports sObject specification
        - Automatic "triggers" directory creation

- **Apex Log Management**: Enhanced debugging capabilities
    - `apex_log_list` - List all Apex debug logs with IDs
        - Returns formatted list of available logs
        - Enables targeted log retrieval
    - `apex_get_log` - Fetch specific or recent debug logs
        - Retrieve logs by ID
        - Get N most recent logs
        - Full debug output support

- **Record Navigation**: New `open_record` tool
    - Open specific Salesforce records directly in browser
    - Supports all standard and custom object records
    - Uses record ID for direct navigation

### Fixed

- Added permission checks to search_records tool for consistency with other tools

## [1.2.4] - 2025-08-13

### Enhanced

- **Query Tools**: Updated `query_records` and `query_records_to_file` tool descriptions to instruct Claude Code to always execute `sobject_list` first before running SOQL queries for better object discovery

### Fixed

- Resolved buffer overflow errors when querying large datasets by increasing `maxBuffer` limit from 10MB to 50MB

## [1.2.2] - 2025-08-07

### Changed

- Published package to NPM registry
- Version bump for npm publication

## [1.2.1] - 2025-08-07

### Added

- **Schema Generation Tools**: New tools for generating metadata
    - `schema_generate_field` - Generate metadata source files for custom fields
        - Supports both standard and custom objects
        - Requires Salesforce DX project structure
        - Interactive field generation with intelligent suggestions
        - Respects READ_ONLY and ALLOWED_ORGS permissions
    - `schema_generate_sobject` - Generate metadata source files for custom objects
        - Creates new custom objects with configurable features
        - Interactive prompts for Name field configuration
        - Optional default features flag for automatic feature enablement
        - Respects READ_ONLY and ALLOWED_ORGS permissions
    - `schema_generate_tab` - Generate metadata source files for custom tabs
        - Creates custom tabs for custom objects
        - Configurable icon selection (1-100)
        - Specifies tabs directory location
        - Respects READ_ONLY and ALLOWED_ORGS permissions
- **Package Management Tools**: New tools for package installation, upgrades, and removal
    - `package_install` - Install or upgrade package versions in Salesforce orgs
        - Supports both package IDs (04t) and aliases
        - Configurable wait time for installation status
        - Installation key support for protected packages
        - Apex compilation options (all or package only)
        - Security type configuration (AllUsers or AdminsOnly)
        - Upgrade type options for unlocked packages (DeprecateOnly, Mixed, Delete)
        - API version override capability
        - Automatic non-interactive mode with --no-prompt flag
    - `package_uninstall` - Uninstall second-generation packages from Salesforce orgs
        - Supports package IDs (04t) and aliases
        - Configurable wait time for uninstall status
        - API version override capability
- **Code Analyzer Tools**: New tools for static code analysis
    - `run_code_analyzer` - Analyze code with configurable rules and engines
        - Supports workspace and target file selection
        - Rule filtering by selector, severity, and configuration
        - Output file generation
        - Handles warnings for missing engines (e.g., Flow engine requiring Python)
    - `list_code_analyzer_rules` - List available analysis rules
        - Filter rules by workspace, target, selector
        - View rules in table or detail format
        - Helps determine rule sets before running analysis
- **Scanner Tools**: New tools for security and code quality scanning
    - `scanner_run` - Scan codebase with multiple analysis engines
        - Supports PMD, ESLint, ESLint-TypeScript, ESLint-LWC, Retire-JS, CPD engines
        - Configurable severity thresholds and normalization
        - Multiple output formats: CSV, HTML, JSON, JUnit, SARIF, Table, XML
        - Verbose violations mode for detailed Retire-JS vulnerability information
        - Custom configuration file support for ESLint, PMD, and TypeScript
    - `scanner_run_dfa` - Run Salesforce Graph Engine for data flow analysis
        - Advanced path-based analysis for security vulnerabilities
        - Detects SOQL injection, SQL injection, and other complex issues
        - Configurable thread count and timeout for performance tuning
        - Support for pilot rules and JVM arguments
        - Path expansion limits for complexity management
- **ORDER BY Support for Query Tools**: Both `query_records` and `query_records_to_file` now support ORDER BY clause
    - Added optional `orderBy` parameter to both query tools
    - Supports sorting by one or multiple fields with ASC/DESC direction
    - Example: 'Name ASC', 'CreatedDate DESC, Name ASC'
- **New Organization Management Tools**:
    - `assign_permission_set` - Assign permission sets to one or more org users
        - Supports multiple permission sets assignment
        - Can assign to specific users or default admin
        - Respects READ_ONLY and ALLOWED_ORGS permissions
    - `assign_permission_set_license` - Assign permission set licenses to org users
        - Supports multiple license assignment
        - Can assign to specific users or default admin
        - Respects READ_ONLY and ALLOWED_ORGS permissions
    - `display_user` - Display information about a Salesforce user
        - Shows profile name, org ID, access token, instance URL, and login URL
        - Displays local alias information
        - Read-only operation with ALLOWED_ORGS check
    - `list_metadata` - List metadata components of a specified type
        - Supports filtering by folder for folder-based metadata
        - Optional API version specification
        - Can output results to file
        - Useful for manifest file creation
    - `list_metadata_types` - Display all metadata types enabled for the org
        - Lists Apex classes, triggers, custom objects, and more
        - Helps identify syntax for package.xml elements
        - Optional API version specification
        - Can output results to file
    - `logout` - Log out of Salesforce orgs
        - Can logout from specific org or all orgs
        - Automatically uses --no-prompt flag for non-interactive execution
        - Respects READ_ONLY and ALLOWED_ORGS permissions
        - Warning about scratch org password access
    - `open` - Open Salesforce org in browser
        - Opens org directly in browser (no --url-only option)
        - Supports specific page navigation via path parameter
        - Browser selection (Chrome, Edge, Firefox)
        - Private/incognito mode support
        - Can open metadata files in their respective builders

### Changed

- **Enhanced Command Execution**: Added `executeSfCommandRaw` function to handle plain text output
    - Scanner and code analyzer tools now properly handle non-JSON output
    - Gracefully handles non-zero exit codes when violations are found
    - Maintains backward compatibility for existing JSON-based tools

## [1.2.0] - 2025-08-05

### Added

- **Permissions System** (formerly called restrictions)
    - `READ_ONLY` environment variable to prevent Apex code execution when set to true
    - `ALLOWED_ORGS` environment variable to restrict access to specific orgs (comma-separated list or 'ALL')
    - Centralized permissions management in `src/config/permissions.ts`
    - `get_server_permissions` tool to check current permission settings (moved to `src/tools/admin.ts`)
- **New Tool**: `login_into_org` - Authenticate and login to Salesforce orgs via web browser
    - Supports production and sandbox orgs
    - Validates required parameters with clear error messages
    - Uses OAuth authentication flow
- **Dynamic Server Description** - Shows current permissions status in MCP server description
- **Desktop Extension Support**
    - Added `user_config` section in manifest.json for configuring READ_ONLY and ALLOWED_ORGS
    - Updated to dxt_version 0.2

### Changed

- Renamed "restrictions" terminology to "permissions" throughout the codebase
- `list_connected_salesforce_orgs` now filters results based on ALLOWED_ORGS permission
- All tools now return structured error responses instead of throwing exceptions
- Improved code organization by moving `get_server_permissions` tool to dedicated admin.ts file
- Updated manifest.json tool list to include all 11 available tools
- Enhanced server description to include version, capabilities, security status, and tool count
- **Query Tools Enhancement**: Both `query_records` and `query_records_to_file` now support SQL functions and expressions
    - Renamed `fields` parameter to `selectClause` to better reflect capability
    - Now supports aggregate functions (COUNT, SUM, AVG, MAX, MIN), expressions, and aliases
    - Updated tool descriptions to clarify support for complex SELECT clauses

### Security

- All tools that require org access now check ALLOWED_ORGS permission before execution
- READ_ONLY mode prevents execution of:
    - `execute_anonymous_apex`
    - `run_apex_tests`
- Org filtering checks both username and aliases for flexibility
- Permission checks return structured JSON error responses for better error handling

## [1.1.1] - 2025-07-31

### Added

- Cross-platform Salesforce CLI path resolution utility (`src/utils/sfCommand.ts`)
    - Automatically detects and uses the correct `sf` CLI path on Windows, macOS, and Linux
    - Checks common installation paths for each platform (Homebrew, npm global, system paths)
    - Falls back to `sf` command in PATH if not found in common locations
    - Caches the path for better performance
    - Provides better error messages when Salesforce CLI is not found

### Changed

- Query tools (`query_records` and `query_records_to_file`) now use the new sfCommand utility
- SObject tools (`sobject_list` and `sobject_describe`) now use the new sfCommand utility
- Improved reliability of CLI operations across different operating systems and installation methods

### Fixed

- Fixed issues with Salesforce CLI not being found on systems where it's installed in non-standard locations
- Better handling of quoted paths on Windows systems

## [1.1.0] - 2025-07-31

### Added

- Desktop Extension (DXT) support for one-click installation
    - Created `manifest.json` with proper DXT configuration
    - Added `build:dxt` npm script to generate `.dxt` files
    - Updated README with DXT installation instructions
    - Created comprehensive DXT.md documentation
    - Supports sandboxed execution with explicit permissions
    - Added website, homepage, and repository fields to manifest.json
- Native Salesforce API integration for Apex execution using `@salesforce/apex-node`
- Shared connection module (`src/shared/connection.ts`) with utilities:
    - `getConnection()` - Get authenticated connection to a Salesforce org
    - `listAllOrgs()` - List all authenticated orgs from CLI
    - `isOrgAuthenticated()` - Check if an org is authenticated
    - `getOrgInfo()` - Get detailed org information
- Three new Apex testing tools using native `TestService`:
    - `run_apex_tests` - Execute Apex tests with various options (test levels, specific classes/methods, code coverage)
    - `get_apex_test_results` - Retrieve results from previous asynchronous test runs
    - `get_apex_code_coverage` - Get code coverage information (org-wide or from specific test runs)
- Support for synchronous and asynchronous test execution
- Comprehensive test result formatting with pass/fail status, stack traces, and error messages
- Code coverage analysis with line-level details and uncovered line reporting
- TypeScript interfaces for better type safety
- Enhanced error handling with specific messages for common failures

### Changed

- Apex execution now uses native `ExecuteService` instead of spawning child processes
- `list_connected_salesforce_orgs` now uses native APIs and provides better organization of results
- Improved project structure with modular organization (tools and shared directories)
- Better error messages for authentication failures
- Removed dependency on temporary files for Apex execution

### Technical Details

- Leverages existing Salesforce CLI authentication via `AuthInfo.listAllAuthorizations()`
- No manual authentication setup required - reuses existing CLI auth
- Better performance through direct API calls instead of process spawning

## [1.0.0] - Initial Release

### Added

- MCP server implementation for Salesforce operations
- Six core tools:
    - `execute_anonymous_apex` - Run Apex code in a Salesforce org
    - `sobject_list` - List all objects in an org
    - `sobject_describe` - Get detailed metadata for a specific SObject
    - `list_connected_salesforce_orgs` - Show connected Salesforce orgs
    - `query_records` - Execute SOQL queries, return JSON
    - `query_records_to_file` - Execute SOQL queries, save to CSV/JSON
- All operations use Salesforce CLI (`sf` command) via child processes
- Zod schemas for input validation
- TypeScript support
